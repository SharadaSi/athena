<?php
// ──────────────────────────────────────────────────────────────────
// GOOGLE REVIEWS PROXY ENDPOINT
// ──────────────────────────────────────────────────────────────────
// Fetches reviews for the CzechAlert Google Business profile using the
// Places API (New) and returns a small, normalised JSON payload for the
// front-end widget (js/google-reviews.js).
//
// WHY A PROXY?
//   The API key must never appear in the browser. This script runs on
//   the server, keeps the key private, caches the response to a file so
//   we don't hammer the API on every page view, and hands the browser
//   only the fields the widget needs.
//
// Request:  GET google-reviews.php?lang=en   (lang is optional: en|cs)
// Response: application/json, shape documented near the bottom.
// ──────────────────────────────────────────────────────────────────

require __DIR__ . '/reviews-config.php';

// ─── 1. RESPONSE HEADERS ────────────────────────────────────────────
header('Content-Type: application/json; charset=UTF-8');

// Allow the widget to be fetched from our own domains (same pattern as
// altcha-challenge.php).
$allowedOrigin  = $_SERVER['HTTP_ORIGIN'] ?? '';
$trustedOrigins = [
    'https://www.czechalert.com',
    'https://czechalert.com',
];
if (in_array($allowedOrigin, $trustedOrigins, true)) {
    header("Access-Control-Allow-Origin: {$allowedOrigin}");
}
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Let the browser cache the JSON briefly too (half the server TTL).
$browserCache = max(60, (int) floor(GOOGLE_REVIEWS_CACHE_TTL / 2));
header("Cache-Control: public, max-age={$browserCache}");

// ─── 2. METHOD GUARD ────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed. Use GET.']);
    exit;
}

// ─── 3. INPUT: LANGUAGE ─────────────────────────────────────────────
// Whitelist the language so we can safely use it in the cache filename
// and pass it to Google for localised/translated review text.
$lang = strtolower(trim($_GET['lang'] ?? 'en'));
if (!in_array($lang, ['en', 'cs'], true)) {
    $lang = 'en';
}

// ─── 4. CACHE SETUP ─────────────────────────────────────────────────
$cacheDir  = __DIR__ . '/cache';
$cacheFile = $cacheDir . "/google-reviews-{$lang}.json";

if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0775, true);
}

// Serve a fresh cache hit immediately — the fast, common path.
if (is_file($cacheFile) && (time() - filemtime($cacheFile) < GOOGLE_REVIEWS_CACHE_TTL)) {
    $cached = file_get_contents($cacheFile);
    if ($cached !== false) {
        echo $cached;
        exit;
    }
}

// ─── 5. CALL THE GOOGLE PLACES API (NEW) ────────────────────────────
// Place Details endpoint. The X-Goog-FieldMask keeps the payload (and
// the billing) minimal by asking only for the fields we render.
$placeId = rawurlencode(GOOGLE_PLACE_ID);
$url     = "https://places.googleapis.com/v1/places/{$placeId}?languageCode={$lang}";

$fieldMask = 'rating,userRatingCount,googleMapsUri,reviews';

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => [
        'X-Goog-Api-Key: ' . GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask: ' . $fieldMask,
    ],
    CURLOPT_TIMEOUT        => 10,
]);
$raw      = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

// ─── 6. HANDLE FAILURE — FALL BACK TO STALE CACHE ───────────────────
// If Google is unreachable or returns an error, prefer showing slightly
// old reviews over an empty section. Only if there is no cache at all do
// we report an error to the widget (which then hides itself gracefully).
$apiOk = ($raw !== false && $httpCode >= 200 && $httpCode < 300);

if (!$apiOk) {
    error_log(sprintf(
        'Google Reviews API error: HTTP %d, curl "%s", body: %s',
        $httpCode,
        $curlErr,
        is_string($raw) ? substr($raw, 0, 500) : '(no body)'
    ));

    if (is_file($cacheFile)) {
        $stale = file_get_contents($cacheFile);
        if ($stale !== false) {
            // Re-tag the payload so we know it's stale, then serve it.
            $decoded = json_decode($stale, true);
            if (is_array($decoded)) {
                $decoded['source'] = 'stale';
                echo json_encode($decoded);
                exit;
            }
            echo $stale;
            exit;
        }
    }

    http_response_code(502);
    echo json_encode([
        'success' => false,
        'source'  => 'error',
        'message' => 'Reviews are temporarily unavailable.',
        'reviews' => [],
    ]);
    exit;
}

// ─── 7. NORMALISE THE PAYLOAD ───────────────────────────────────────
$data    = json_decode($raw, true) ?: [];
$reviews = [];

foreach (($data['reviews'] ?? []) as $review) {
    if (count($reviews) >= GOOGLE_REVIEWS_MAX) {
        break;
    }

    $author = $review['authorAttribution'] ?? [];
    $text   = $review['text']['text'] ?? ($review['originalText']['text'] ?? '');

    // Skip empty, text-less reviews — they add no value to the section.
    if (trim($text) === '') {
        continue;
    }

    $reviews[] = [
        'author' => (string) ($author['displayName'] ?? 'Google user'),
        'avatar' => (string) ($author['photoUri'] ?? ''),
        'url'    => (string) ($author['uri'] ?? ''),
        'rating' => (int) ($review['rating'] ?? 0),
        'time'   => (string) ($review['relativePublishTimeDescription'] ?? ''),
        'text'   => trim($text),
    ];
}

$payload = [
    'success'     => true,
    'source'      => 'google',
    'rating'      => isset($data['rating']) ? round((float) $data['rating'], 1) : null,
    'ratingCount' => (int) ($data['userRatingCount'] ?? 0),
    'profileUrl'  => (string) ($data['googleMapsUri'] ?? ''),
    'reviews'     => $reviews,
];

$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

// ─── 8. WRITE CACHE + RESPOND ───────────────────────────────────────
// LOCK_EX avoids a torn file if two requests refresh at the same moment.
if (is_dir($cacheDir) && is_writable($cacheDir)) {
    @file_put_contents($cacheFile, $json, LOCK_EX);
}

echo $json;

// ──────────────────────────────────────────────────────────────────
// RESPONSE SHAPE (for js/google-reviews.js)
// {
//   "success": true,
//   "source": "google" | "stale" | "error",
//   "rating": 5.0,            // average star rating, or null
//   "ratingCount": 12,        // total number of ratings
//   "profileUrl": "https://maps.google.com/...",
//   "reviews": [
//     {
//       "author": "Jane D.",
//       "avatar": "https://lh3.googleusercontent.com/...",
//       "url":    "https://www.google.com/maps/contrib/...",
//       "rating": 5,
//       "time":   "a month ago",
//       "text":   "Great, discreet service..."
//     }
//   ]
// }
// ──────────────────────────────────────────────────────────────────
