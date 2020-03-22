const fs = require("fs");
const path = require("path");
const { Vimeo } = require("vimeo");

// settings
const headings = {
  name: "Name",
  description: "Description",
  created_time: "Created",
  duration: "Duration",
  link: "Link",
  "categories.uri": "Categories",
  "tags.uri": "Tags"
};
const OUTPUT = "staff_picks";

// init

require("dotenv").config();
const PATH = "/channels/staffpicks/videos";
const client = new Vimeo(
  process.env.VIMEO_CLIENT_ID,
  process.env.VIMEO_CLIENT_SECRET,
  process.env.ACCESS_TOKEN
);

// fetch
function getTotal() {
  return new Promise((resolve, reject) => {
    client.request(
      { path: PATH, query: { page: 1, per_page: 1, fields: "uri" } },
      (error, body) => {
        if (error) {
          console.error("Could not get total");
          reject();
        }
        resolve(body.total);
      }
    );
  });
}

function toCSV(data) {
  const sep = `,`;
  const sanitize = text => '"' + text.replace(/"/g, '""') + '"';

  return [Object.values(headings).join(sep)]
    .concat(
      data.map(video => {
        try {
          return [
            sanitize(video.name),
            video.description ? sanitize(video.description) : "",
            video.created_time,
            video.duration,
            video.link,
            sanitize(
              video.categories
                .filter(c => !!c)
                .map(c => c.uri.replace(/\/categories\//, ""))
                .join(",")
            ),
            sanitize(
              video.tags
                .filter(t => !!t)
                .map(t => t.uri.replace(/\/tags\//, ""))
                .join(",")
            )
          ].join(sep);
        } catch (err) {
          console.error(err);
        }
      })
    )
    .join("\n");
}

function fetchPage({ page, per_page = 100, retry = 1 }) {
  if (!page) {
    throw new Error("page must be >= 1");
  }

  return new Promise((resolve, reject) => {
    client.request(
      {
        path: PATH,
        query: { page, per_page, fields: Object.keys(headings).join(",") }
      },
      (error, body) => {
        if (body) {
          return resolve(body.data);
        }

        // retry if erred, or fail after 3 retries
        if (retry > 3) {
          console.error(`Erred on page ${page}: ${error}`);
          return reject();
        } else {
          console.warn(`Erred on page ${page}. Retry ${retry}…`);
          setTimeout(
            () =>
              fetchPage({ page, per_page, retry: retry + 1 }).then(data =>
                resolve(data)
              ),
            3000
          );
        }
      }
    );
  });
}

async function main() {
  // settings
  const PER_PAGE = 100; // max 100

  // exec
  const total = await getTotal(); // send a lightweight ping to retrieve total number before fetching all in parallel
  const pageCount = Math.ceil(total / PER_PAGE);
  const allPages = [...Array.from(new Array(pageCount))];

  // fetch all pages in parallel
  const pages = await Promise.all(
    allPages.map((_, i) => fetchPage({ page: i + 1, per_page: PER_PAGE }))
  );
  const data = pages.flat();

  // sort by created_time
  data.sort((a, b) => a.created_time.localeCompare(b.created_time));

  fs.writeFileSync(
    path.resolve(__dirname, `${OUTPUT}.json`),
    JSON.stringify(data),
    "utf8"
  );
  fs.writeFileSync(
    path.resolve(__dirname, `${OUTPUT}.csv`),
    toCSV(data),
    "utf8"
  );

  console.info(`🎥 ${data.length}/${total} videos successfully retrieved`);
}

main();
