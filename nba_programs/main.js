var fs = require('fs')
  , jsdom = require('jsdom')
  , Memcached = require('memcached');

var qqnba = require('./qqnba')
  , ppnba = require('./ppnba');

var logpath = __dirname + '/run.log';
var cachepath = __dirname + '/data.json';

var pplive = {}, qqlive = {}, qqreview = [];

ppnba.load(function(live) {
	pplive = live;
	console.log('ppnba loaded.');
	
	qqnba.load(function(live, review) {
		qqlive = live;
		qqreview = review;
		console.log('qqnba loaded.');
		
		console.log('grabing programs.');
		grabPrograms();
	});
});

function grabPrograms()
{
	jsdom.env('http://www.zhibo8.com/', ['https://ajax.googleapis.com/ajax/libs/jquery/1.7.1/jquery.min.js'],
	function(errors, window) {
		var $ = window.$;

		var days = [];
		var boxes = $('#left > .box');

		var istoday = true;
		boxes.each(function(index) {
			var day = { date: null, programs: []};
			var box = $(this);

			var title = box.children('div.titlebar').text();
			var theday = parseDate($.trim(title));
			//day.date = parseInt(theday.getTime() / 1000);
			day.date = (parseInt(theday.getMonth()) + 1).toString() + '-' + theday.getDate().toString();
			//console.log(theday.toString());

			var rows = box.find('div.content > ul > li');

			rows.each(function() {
				var row = $(this);
				var sina_live = row.find('a:contains("新浪")').size() > 0;
				var cctv_live = row.find('a:contains("CCTV")').size() > 0;

				var links = row.children('a');
				links.detach();

				var text = $.trim(row.text());
				if (text.indexOf('NBA') == -1) {
					return true;
				}

				var p = parseProgram(text);
				
				// CCTV 无插件直播
				if (cctv_live) {
					p.links.push(['CCTV5直播（无插件）', 'http://www.wasu.cn/Live/show/id/442']);
				}
				
				// SINA 插件直播
				if (sina_live) {
					p.links.push(['新浪直播', 'http://live.video.sina.com.cn/room/nba']);
				}
				
				// 从ppnba抓取的链接
				var pplinks = getFromPPNBA(day.date, p.teams[0]);
				if (pplinks.length > 0) {
					p.links = p.links.concat(pplinks);
				}
				
				// QQ 直播链接（3类）和比分
				if (istoday) {
					var qqlink = qqlive[p.teams[0]];
					if (qqlink) {
						p.links.push(qqlink.link);
						if (qqlink.end) {
							p.scores = qqlink.scores;
						}
					}
				}
				
				// 比分直播（固定）
				p.links.push(['比分直播', 'http://www.188bifen.com/lanqiubifen.htm']);
				//console.log(p);
				
				day.programs.push(p);
			});

			// 当前无节目，检查QQ是否有回顾数据，有的话就抓回来
			console.log(day.programs.length, istoday, qqreview.length);
			if (day.programs.length == 0 && istoday && qqreview.length > 0) {
				day.programs = qqreview;
			}

			days.push(day);

			istoday = false;
		});

		var cache = JSON.stringify(days);
		//fs.writeFile(cachepath, cache);

		var m = new Memcached('127.0.0.1:11211');
		m.set('nba_programs', cache, 172800, function(error, result) {
			//if (error) {
			//	console.error(error);
			//}
			//console.dir(result);
			m.end();
		});

		writeLog('Size: ' + cache.length);

		console.log('Done.');
	});
}

function getFromPPNBA(date, team)
{
	var empty = [];

	if (!pplive[date]) {
		return empty;
	}
	if (!pplive[date][team]) {
		return empty;
	}
	return pplive[date][team];
}

function parseDate(raw)
{
	var pattern = /^(\d{2})月(\d{2})日/;
	matches = pattern.exec(raw);
	if (matches === null) {
		return null;
	}

	var d = new Date();
	d.setMonth(parseInt(matches[1]) - 1);
	d.setDate(matches[2]);

	return d;
}

function parseProgram(raw)
{
	var special = false;

	var pattern = /(\d{2}:\d{2})\s{1,2}(\S*)\s(\S*)[\s–|\-]{1,5}(\S*)/;
	var matches = pattern.exec(raw);
	if (matches === null) {
		console.log(raw, 'null');
		special = true;
		matches = /(\d{2}:\d{2})\S*\s{1,2}(\S*)\s(.*)/.exec(raw);
		if (matches === null) {
			return null;
		}
	}

	var p = {};
	p.time = matches[1];
	p.type = matches[2];
	p.teams = special ? [matches[3], matches[3]]:  [matches[3], matches[4]];
	p.links = [];
	p.scores = null;

	return p;
}

function writeLog(content)
{
	var d = new Date();
	var prefix = '[' + d.getFullYear() + '-' +  d.getMonth() + '-'  + d.getDate() + ' ' + d.getHours() + ':' + d.getMinutes() + ':' + d.getSeconds() + ']';

	content = prefix + ' ' + content + '\n';

	fs.open(logpath, 'a+', 0666, function(error, fd) {
		fs.write(fd, new Buffer(content), 0, content.length, null, function(error, written) {
			fs.close(fd);
		})
	});
}
