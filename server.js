const http = require('http');

// Listen on a specific host via the HOST environment variable
// var host = process.env.HOST || '0.0.0.0';
// Listen on a specific port via the PORT environment variable
var port = process.env.PORT || 8080;

const fs = require('fs');
const mime = require('mime');
const AWS = require('aws-sdk');
// AWS.config.loadFromPath('./config.json');

const s3Bucket = new AWS.S3({params: {Bucket: 'gauntlet-images'}});

var download = function(url, dest, cb) {
  var file = fs.createWriteStream(dest);
  var request = http.get(url, function(response) {
    response.pipe(file);
    file.on('finish', function() {
      file.close(cb);  // close() is async, call cb after close completes.
    });
  });
};

const requestHandler = (request, response) => {
  const image_url = request.url.slice(1);
  const image_file = image_url.substring(image_url.lastIndexOf('/') + 1);
  const image_path = `./tmp/${image_file}`;
  const mimeType = mime.lookup(image_path);

  if (mimeType !== 'image/x-icon') {
    download(image_url, image_path, () => {
      const param_data = {
        Key: image_file,
        Body: fs.readFileSync(image_path),
        ContentType: mimeType,
      };

      s3Bucket.upload(param_data, function(err, output_data) {
        if (err) {
          console.log('Error uploading data to S3: ' + err);
        } else {
          response.end(`We mirrored it: ${output_data.Location}`);
        }
      });
    });
  }

};

const server = http.createServer(requestHandler);

server.listen(port, (err) => {
  if (err) {
    return console.log('something bad happened', err)
  }

  console.log(`server is listening on ${port}`)
});