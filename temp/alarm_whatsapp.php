<?php

	// Update the path below to your autoload.php,
	// see https://getcomposer.org/doc/01-basic-usage.md
	require_once '/path/to/vendor/autoload.php';

	use Twilio\Rest\Client;

	// Find your Account Sid and Auth Token at twilio.com/console
	// and set the environment variables. See http://twil.io/secure
	$sid = getenv("ACd6db45eba7ca8b1e522992298182b453");
	$token = getenv("8acc55cb5775aa2e8c3acca43cacae8c");
	$twilio = new Client($sid, $token);

	$message = $twilio->messages
	    ->create("whatsapp:+56968439779", // to
	        [ "from" => "whatsapp:+14155238886", "body" => "Hello there!" ]
		);

?>