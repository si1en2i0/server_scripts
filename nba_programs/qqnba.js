var iconv = require('iconv');
var request = require('request');

var headers = {
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Charset': 'GBK,utf-8;q=0.7,*;q=0.3',
    'Accept-Language': 'zh-CN,zh;q=0.8',
    'Cache-Control': 'max-age=0',
    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.7 (KHTML, like Gecko) Chrome/16.0.912.63 Safari/535.7'
}

function qqnba() {}

qqnba.load = function(callback) {
	var live = {}, review = [];
	
	request({ uri:'http://sports.qq.com/c/today_schedules_new.htm', headers: headers }, function(error, response, body) {
		body = (new iconv.Iconv('GBK','UTF-8//TRANSLIT//IGNORE')).convert(new Buffer(body)).toString();
		body = body.substr(0, body.length - 64);
		var o = JSON.parse(body);
		for (var i in o) {
			var row = o[i];
			var time = row.matchTime.substr(6, 5);
			var text;

			switch (row.zhibotype) {
				case 'text':
					text = '互动直播'; break;
				case 'video':
					text = '视频直播'; break;
				default:
					text = '文字直播';
			}

			var url = row.zhiboUrl ? row.zhiboUrl : row.url;
			var scores = [row.visitTeamScore, row.homeTeamScore];
			console.log(row.status, row.homeTeamName, row.homeTeamScore);
			if (row.status == '已结束') {
				live[row.homeTeamName] = {end:true, scores: scores, link:['直播实录', url]}; 
				review.push({
					time: time,
					types: '',
					links: [['直播实录', url]],
					teams: [row.visitTeamName, row.homeTeamName],
					scores: scores 
				});
			} else {
				live[row.homeTeamName] = {end:false, link:[text, url]}; 
			}
		}
		callback(live, review);
	});
}

module.exports = qqnba;
