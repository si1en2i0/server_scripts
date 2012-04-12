#coding: utf-8

Dir.chdir File.dirname(__FILE__)

require 'nokogiri'
require 'memcached'
require 'json'
require 'open-uri'

def get_source(url, *args)
	options = args[0] || {}

	source = open(url).read
	if options[:gbk]
		source.force_encoding('gbk')
		source = source.encode!('utf-8', :undef => :replace, :replace => "?", :invalid => :replace)
	end
	source
end

def get_doc(url, gbk = false)
	source = get_source(url, :gbk => gbk)
	Nokogiri::HTML.parse(source)
end

def fetchURL(raw)
	/ppnba=(http.*)/ =~ raw;
	$1
end

def parse_program(raw)
	special = false

	/(\d{2}:\d{2})[\s ]{1,2}(\S*)[\s ](\S*)[ \s–|\-]{1,5}(\S*)/m =~ raw
	if $1.nil?
		special = true
		/(\d{2}:\d{2})\S*\s{1,2}(\S*)\s(.*)/ =~ raw
		if $1.nil?
			return nil
		end
	end 

	{
		:time => $1,
		:type => $2,
		:teams => special ? [$3, $3] : [$3, $4],
		:links => [],
		:scores => nil
	}
end

def get_from_ppnba(date, home_team)
	record = @ppnba[date]
	if record.nil? or !record.has_key?(home_team)
		[]
	else
		record[home_team]
	end
end

# get programs progress from qq JSON API, store video or text live url
json = get_source('http://sports.qq.com/c/today_schedules_new.htm', :gbk => true)

begin
	progress = JSON.parse(json[0, json.length - 64])
rescue
	exit
end

@qq = { :live => {}, :review => []}
progress.each do |item|
	case item['zhibotype']
	when 'text'
		text = '互动直播'
	when 'video'
		text = '视频直播'
	else
		text = '文字直播'
	end
	
	url = item['zhiboUrl'] ? item['zhiboUrl'] : item['url'];
	if item['status'] == '已结束'
		scores = [item['homeTeamScore'], item['visitTeamScore']]
		@qq[:live][item['homeTeamName']] = { :end => true, :scores => scores, :link => ['直播实录', url] }; 
		@qq[:review] << {
			:time => item['matchTime'][6, 5],
			:types => '',
			:links => [['直播实录', url]],
			:teams => [item['homeTeamName'], item['visitTeamName']],
			:scores => scores
		};
	else
		@qq[:live][item['homeTeamName']] = { :end => false, :link => [text, url] }
	end
end

# get live link from ppnba.com
doc = get_doc('http://www.ppnba.com/', true)

@ppnba = {}
doc.css('div.mcol_02').each do |div|
	/\d{4}\-(\d{2}\-\d{2})/ =~ div.css('div.title1').text

	next if $1.nil?

	date = $1
	data = {}

	div.css('ul > li').each do |li|
		title = li.css('div.tit')
		unless title.text.include?('NBA')
			next
		end

		time = title.text[0, 5]

		teams = []
		title.css('a').each do |a|
			teams << a.text
		end

		links = []

		li.css('div.con > a').each do |a|
			t = a.text

			case
			when t.include?('纬来')
				links << ['纬来直播', fetchURL(a.attr('href'))]
			when t.include?('广州体育')
				links << [t, 'http://www.ppnba.com/tv/130.html']
			when t.include?('北京体育')
				links << [t, 'http://www.ppnba.com/tv/23.html']
			when t.include?('sportlemon'), t.include?('firstrowsports')
				links << [t, fetchURL(a.attr('href'))]
			end

			data[teams[1]] = links
		end

		@ppnba[date] = data
	end
end

# get remains programs of today
days = []
istoday = true

doc = get_doc('http://www.zhibo8.com/')
doc.css('#left > .box').each do |box|
	title = box.css('div.titlebar > h2').inner_html

	day = {
		:date => '%s-%s' % [title[0, 2], title[3, 2]],
		:programs => []
	}

	box.css('div.content > ul > li').each do |li|
		unless li.text.include?('NBA')
			next
		end

		has_cctv = has_sina = false

		anchors = li.css('a')
		anchors.each do |a|
			if a.text.include?('CCTV')
				has_cctv = true
			elsif a.text.include?('新浪')
				has_sina = true
			end
		end
		anchors.unlink()

		p = parse_program(li.text)

		if has_cctv
			p[:links] << ['CCTV5直播（无插件）', 'http://www.wasu.cn/Live/show/id/442']
		end
		if has_sina
			p[:links] << ['新浪直播', 'http://live.video.sina.com.cn/room/nba']
		end

		home_team = p[:teams][0]

		pplinks = get_from_ppnba(day[:date], home_team)
		if pplinks.count
			p[:links].concat(pplinks)
		end

		if istoday
			qqlinks = @qq[:live][home_team]
			if qqlinks
				p[:links] << qqlinks[:link]
				if qqlinks[:end]
					p[:scores] = qqlinks[:scores]
				end
			end
		end

		p[:links] << ['比分直播', 'http://www.188bifen.com/lanqiubifen.htm']

		day[:programs] << p
	end

	if day[:programs].count == 0 && istoday && @qq[:review].count > 0
		#day[:programs] = @qq[:review]
	end

	days << day

	istoday = false
end

cache = JSON.generate(days)

m = Memcached.new('localhost:11211')
m.set 'nba_programs', cache, 604800, false
m.quit

@logfile = File.new('run.log', 'a+');
@logfile.puts '%s Size: %d' % [Time.now.strftime('%Y-%m-%d %H:%M:%S'), cache.length]
@logfile.close

print 'Done'
