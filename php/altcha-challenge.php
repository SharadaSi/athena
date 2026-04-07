<?php
// ──────────────────────────────────────────────────────────────────
// ALTCHA CHALLENGE ENDPOINT
// Returns a fresh PoW challenge as JSON for the ALTCHA widget.
// The widget calls this URL via its "challengeurl" attribute.
// ──────────────────────────────────────────────────────────────────

require __DIR__ . '/vendor/autoload.php';
require __DIR__ . '/altcha-config.php';

use AltchaOrg\Altcha\Altcha;
use AltchaOrg\Altcha\ChallengeOptions;

// Only accept GET requests.
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    exit('This endpoint only accepts GET requests.');
}

// Prevent caching — every challenge must be unique and fresh.
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Content-Type: application/json; charset=UTF-8');

// Allow the widget on the same origin to fetch this endpoint.
// Adjust the origin below if your site uses a different domain.
$allowedOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
$trustedOrigins = [
    'https://www.czechalert.com',
    'https://czechalert.com',
];

if (in_array($allowedOrigin, $trustedOrigins, true)) {
    header("Access-Control-Allow-Origin: {$allowedOrigin}");
}

// Create a new ALTCHA instance with the HMAC secret.
$altcha = new Altcha(ALTCHA_HMAC_KEY);

// Generate a challenge that expires in 10 minutes.
$options = new ChallengeOptions(
    maxNumber: 50000,
    expires: (new \DateTimeImmutable())->add(new \DateInterval('PT10M')),
);

$challenge = $altcha->createChallenge($options);

// Return the challenge as JSON — the widget expects this format.
echo json_encode($challenge);
