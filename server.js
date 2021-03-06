const http = require('http');
const fs = require('fs');
const mime = require('mime');
const AWS = require('aws-sdk');
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();

// Listen on a specific port via the PORT environment variable
const port = process.env.PORT || 8080;

// Downloads and saves  a file, then runs a callback function
function download(url, dest, cb) {
  const file = fs.createWriteStream(dest);
  http.get(url, (response) => {
    response.pipe(file);
    file.on('finish', () => {
      // close() is async, call cb after close completes.
      file.close(cb);
    });
  });
}

function extractDomain(url) {
  const matches = url.match(/^https?\:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
  return matches && matches[1];
}

// Checks if a domain passes
function isValidDomain(url) {
  return extractDomain(url) === 'i.4cdn.org';
}

// Use a (local, ignored) config file if present
// Needs to happen before bucket initialisation.
if (fs.existsSync('./config.json')) {
  AWS.config.loadFromPath('./config.json');
}

// Set up our bucket
const s3Bucket = new AWS.S3({params: {Bucket: 'gauntlet-images'}});

// Set up the request handler
const requestHandler = (request, response) => {
  if (request.method !== 'POST') return;

  jsonParser(request, response, () => {
    const image_url = request.body.url;
    const image_folder = request.body.folder || '';
    const image_file = image_url.substring(image_url.lastIndexOf('/') + 1);
    const image_key = `${image_folder}/${image_file}`;
    const image_path = `./tmp/${image_file}`;
    const mimeType = mime.lookup(image_path);

    // Ignore favicons
    if (isValidDomain(image_url) && mimeType !== 'image/x-icon') {
      // Check if we already have the file...
      s3Bucket.headObject({ Key: image_key }).on('success', () => {
        // Abort if we've already mirrored it
        response.end('Already mirrored.');
      }).send();

      // ...otherwise start the download
      download(image_url, image_path, () => {
        // Set up the params for S3
        const param_data = {
          Key: image_key,
          Body: fs.readFileSync(image_path),
          ContentType: mimeType,
        };

        // Try and upload the image to S3
        s3Bucket.upload(param_data, (err, output_data) => {
          if (err) {
            response.writeHead(500, { "Content-Type": "application/json" });
            response.end(JSON.stringify({
              message: `Error uploading to S3`,
              url: null,
            }));
          } else {
            response.writeHead(200, { "Content-Type": "application/json" });
            console.log(JSON.stringify(output_data));
            response.end(JSON.stringify({
              message: `We mirrored it: ${output_data.Location}`,
              url: `${output_data.Location}`,
              img_root: `https://${extractDomain(output_data.Location)}/${image_folder}/`,
            }));
          }
        });
      });
    } else {
      response.end('Something went wrong.');
    }
  });
};

const server = http.createServer(requestHandler);

server.listen(port, (err) => {
  if (err) {
    return console.log('something bad happened', err);
  }

  console.log(`server is listening on ${port}`);
});