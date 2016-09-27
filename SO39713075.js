/**
 * Created by cool.blue on 27-Sep-16.
 */
var cheerio = require('cheerio');
var json2csv = require('json2csv');
var request = require('request');
var moment = require('moment');
var fs = require('fs');
var path = require('path');
var urlParse = require('url').parse;
var mkdirp = require('mkdirp');

//harcoded url
var url = 'http://shirts4mike.com/';

const requestHTML = function (url, encoding) {
  var options = {url: url};
  if(options)
    options.encoding = encoding;
  return new Promise(function (resolve, reject) {
    request.get(options, function (error, response, body) {

      if (error)
        return reject(error);
      else
        return resolve(body);

    });
  });
};


function scrapeLinks(html, selector, attr) {

  var $ = cheerio.load(html);

  var links = [];

  //get all the links
  $(selector).each(function () {
    var a = $(this).attr(attr);

    //add into link array
    links.push(url + a);
  });
  // return array of links
  return links;

}

function requestLinkedAssets(arrayOfLinks, encoding) {
  var promises = Promise.all(arrayOfLinks.map(link => {
    return requestHTML(link, encoding)
  }));
  return {linkRequests: promises, arrayOfUrls: arrayOfLinks};
}

function classifyLinkedPages(scope) {
  return scope.linkRequests.then(linkedPages => {
      linkedPages.forEach((html, i) => {

        var url = scope.arrayOfUrls[i];                             // transform arrayOfUrls to be an array of objects
        url = scope.arrayOfUrls[i] = {link: url, type: null};

        if (cheerio.load(html)('[type=submit]').length !== 0) {     //if page has a submit it must be a product page

          url.type = 'product';                                     //add page to set
          scope.included = scope.included || {};
          scope.included[url.link] = html;

        }
      });
      return scope;
    }
  )
}

function printSummary (scope) {
  console.log('Product Links');
  scope.arrayOfUrls.filter(_ => _.type === 'product').map(_ => _.link)
    .forEach(_ => console.log('\t', _));
  console.log('Remainder Links');
  scope.arrayOfUrls.filter(_ => _.type !== 'product').map(_ => _.link)
    .forEach(_ => console.log('\t', _));
  return scope;
}

var touchDir = (function () {
  var cache = {};
  return function touchDir(path) {
    return new Promise((res, rej) => {
      function cb (e) {
        if(e)
          rej(e);
        else
          res()
      }
      if (cache[path])
        return res();
      fs.stat(path, function (err) {
        if (err) {
          mkdirp(path, cb)
        }
      });
      cache[path] = true;
    })
  }
})();

function saveImage (img, url) {

  var fileName = path.join(__dirname, urlParse(url).path);
  var dir = path.dirname(fileName);


  return touchDir(dir).then(() => {
    return new Promise((res, rej) => {
      function cb (e) {
        if(e)
          rej(e);
        else
          res(fileName)
      }
        fs.writeFile(fileName, img, 'binary', cb);
      }
    )
  },
  e => {console.log('saveImage ' + e.stack); throw e})

}

function getShirts (scope) {

  return scope.arrayOfUrls                                              // filter out the excluded links
    .filter(_ => _.type === 'product')
    .map(d =>                                                           // return an array of links from each included page
      scrapeLinks(scope.included[d.link], '.shirt-picture img', 'src')  // scrape shirt image links
    )                                                                   // request the images for each page
    .map(links => requestLinkedAssets(links, 'binary'))                 // an array of promises to return an arrays of images
    .map(pageScope =>
      pageScope.linkRequests.then(images =>
        images.map((img, i) =>
          saveImage(img, pageScope.arrayOfUrls[i])
            .then(fileName => console.log(fileName))
        )
      ).catch(e => {
        console.log(e.stack)
      })
    );
}

requestHTML(url)
  .then(html => scrapeLinks(html, 'a[href*=shirt]', 'href'))
  .then(requestLinkedAssets)
  .then(classifyLinkedPages)
  .then(printSummary)
  .then(getShirts)
  .catch(function (err) {
    // handle any error from any request here
    console.log(err);
  });