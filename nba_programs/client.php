<?php

$m = new Memcached();
$m->addServer('localhost', 11211, 100);
$row = $m->get('nba_programs');

$days = json_decode($row, true);

print_r($days);
