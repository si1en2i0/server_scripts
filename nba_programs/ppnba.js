var fs = require('fs');
var iconv = require('iconv');
var jsdom = require('jsdom');
var request = require('request');

function ppnba() {}

ppnba.load = function(callback) {
	var programs = {};

	request({uri: 'http://www.ppnba.com/', encoding: 'binary'},
		function(error, response, body) {
			body = new Buffer(body, 'binary');
			conv = new iconv.Iconv('gbk', 'utf8');
			body = conv.convert(body).toString();

			jsdom.env({
				html: body,
				src: [fs.readFileSync(__dirname + '/jquery.min.js').toString()],
				done: function(error, window) {
					var $ = window.$;

					$('div.mcol_02:gt(1)').each(function(index) {
						var div = $(this);

						var matches = /\d{4}\-(\d{2})\-(\d{2})/.exec(div.find('div.title1').text());
						var month = parseInt(matches[1]).toString();
						var day = parseInt(matches[2]).toString();
						var date = month + '-' + day;

						//console.log(date);

						var days = {};
						div.find('ul > li').each(function() {
							var li = $(this);
							var title = li.find('div.tit');
							
							if (title.find('span.bold:contains("NBA")').size() == 0) {
								return true;
							}

							var time = title.text().substr(0, 5);
							var teams = [];
							title.find('a').each(function() {
								teams.push($(this).text());
							});
							
							//console.log(time, teams);

							var links = []; 
							li.find('div.con > a').each(function() {
								var l = $(this);
								var t = l.text();

								if (t.indexOf('纬来') != -1) {
									links.push(['纬来直播', 'http://www.ppnba.com/tv/wltyt.html']);
								} else if (t.indexOf('广州体育') != -1) {
									links.push([t, 'http://www.ppnba.com/tv/130.html']);
								} else if (t.indexOf('北京体育') != -1) {
									links.push([t, 'http://www.ppnba.com/tv/23.html']);
								} else if (t.indexOf('sportlemon') != -1) {
									links.push([t, fetchURL(l.attr('href'))]);
								} else if (t.indexOf('firstrowsports') != -1) {
									links.push([t, fetchURL(l.attr('href'))]);
								}
								// TODO 还有两个国外转播台
							});

							days[teams[1]] = links;
						});

						programs[date] = days;
					});
					callback(programs);
				}
			});
		}
	);
}

module.exports = ppnba;

function fetchURL(raw)
{
	var matches = /ppnba=(http.*)/.exec(raw);
	return matches[1];
}
