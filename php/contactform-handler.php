<?php
// ──────────────────────────────────────────────────────────────────
// CONTACT FORM HANDLER
// Receives POST data from contact.html, sanitizes it, and sends
// an email to the site owner.
// ──────────────────────────────────────────────────────────────────

require __DIR__ . '/vendor/autoload.php';
require __DIR__ . '/altcha-config.php';

use AltchaOrg\Altcha\Altcha;


// ─── 1. CONFIGURATION ────────────────────────────────────────────

$receiverEmail = 'info@czechalert.com';   // ← replace with your real email
$emailSubject  = 'New inquiry from CzechAlert website';


// ─── 2. REJECT NON-POST REQUESTS ────────────────────────────────
// Someone could visit this URL directly in the browser (GET request).
// We only want to process the form submission (POST request).

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    // 405 = "Method Not Allowed" HTTP status code
    http_response_code(405);
    exit('This endpoint only accepts POST requests.');
}


// ─── 3. READ & SANITIZE INPUTS ──────────────────────────────────
// $_POST is a superglobal array PHP fills automatically with form data.
// Each key matches the "name" attribute from your HTML <input> elements.
//
// htmlspecialchars() converts special characters to safe HTML entities:
//   <script>  →  &lt;script&gt;
// This prevents Cross-Site Scripting (XSS) attacks.
// trim() removes whitespace from the beginning and end of the string.

$name           = htmlspecialchars(trim($_POST['name'] ?? ''));
$email          = htmlspecialchars(trim($_POST['email'] ?? ''));
$urgency        = htmlspecialchars(trim($_POST['urgency'] ?? ''));
$projectDetails = htmlspecialchars(trim($_POST['project details'] ?? ''));
$budgetMin      = htmlspecialchars(trim($_POST['input-min'] ?? '200'));
$budgetMax      = htmlspecialchars(trim($_POST['input-max'] ?? '5000'));

// The ?? operator is called "null coalescing". It means:
// "use the value on the left if it exists, otherwise use the fallback on the right"
// Example: $_POST['name'] ?? ''  →  if name wasn't sent, use empty string


// ─── 4. COLLECT CHECKED INTEREST CHECKBOXES ─────────────────────
// Checkboxes only appear in $_POST when checked.
// isset() returns true if the key exists in the array.
// We check each one and build a comma-separated string.

$interestOptions = [
    'investigation'         => 'Investigation',
    'media monitoring'      => 'Media monitoring',
    'privacy consulting'    => 'Digital privacy consulting',
    'strategic intelligence' => 'Strategic intelligence',
    'risk management'       => 'Risk management',
    'lecture'               => 'Lecture',
    'other'                 => 'Other',
];

// Loop through all possible options, keep only the checked ones
$selectedInterests = [];
foreach ($interestOptions as $postKey => $label) {
    if (isset($_POST[$postKey])) {
        $selectedInterests[] = $label;
    }
}

// Join the array into a single string: "Investigation, Lecture, Other"
$interestsText = !empty($selectedInterests)
    ? implode(', ', $selectedInterests)
    : 'None selected';


// ─── 5. SERVER-SIDE VALIDATION ──────────────────────────────────
// Never trust the client! JS validation can be bypassed.
// We re-check the critical fields here on the server.

$errors = [];

if (empty($name)) {
    $errors[] = 'Name is required.';
}

if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    // filter_var with FILTER_VALIDATE_EMAIL checks if the email
    // has a valid format (same idea as your HTML pattern attribute).
    $errors[] = 'A valid email is required.';
}

if (empty($urgency)) {
    $errors[] = 'Urgency selection is required.';
}

// If there are any errors, stop and show them
if (!empty($errors)) {
    http_response_code(422);   // 422 = "Unprocessable Entity"
    exit('Validation failed: ' . implode(' ', $errors));
}


// ─── 5b. VERIFY ALTCHA ─────────────────────────────────────────
// The ALTCHA widget submits a hidden field named "altcha" containing
// a Base64-encoded proof-of-work payload. We verify it here with
// the same HMAC key used to generate the challenge.
// This is the real anti-spam gate — client-side checks are only UX.

$altchaPayload = $_POST['altcha'] ?? '';

if (empty($altchaPayload)) {
    // No ALTCHA payload — likely a bot that skipped the widget entirely.
    $referer = $_SERVER['HTTP_REFERER'] ?? '/contact.html';
    header("Location: {$referer}?status=captcha");
    exit;
}

$altcha = new Altcha(ALTCHA_HMAC_KEY);

// verifySolution accepts the Base64 payload string and checks expiry.
$altchaVerified = $altcha->verifySolution($altchaPayload, true);

if (!$altchaVerified) {
    // PoW solution invalid or challenge expired — reject the submission.
    $referer = $_SERVER['HTTP_REFERER'] ?? '/contact.html';
    header("Location: {$referer}?status=captcha");
    exit;
}


// ─── 6. BUILD THE EMAIL BODY ────────────────────────────────────

$body  = "New inquiry from the CzechAlert contact form\n";
$body .= "=============================================\n\n";
$body .= "Name:             {$name}\n";
$body .= "Email:            {$email}\n";
$body .= "Interests:        {$interestsText}\n";
$body .= "Urgency:          {$urgency}\n";
$body .= "Budget:           €{$budgetMin} – €{$budgetMax}\n";
$body .= "Project details:\n{$projectDetails}\n";

// The .= operator appends to the string (concatenation assignment).
// \n is a newline character — it creates a new line in the email.
// {$variable} inside double quotes inserts the variable's value.


// ─── 7. SET EMAIL HEADERS ───────────────────────────────────────
// Headers tell the email server who the message is from,
// what format it uses, and where to send replies.

$headers  = "From: noreply@czechalert.com\r\n";            // Sender shown in the email
$headers .= "Reply-To: {$email}\r\n";                      // Clicking "Reply" goes to the client
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n"; // Plain text, supports Czech characters

// \r\n (carriage return + newline) is required by the email standard (RFC 2822)
// for separating headers. It's different from just \n.


// ─── 8. SEND THE EMAIL ─────────────────────────────────────────
// mail() is PHP's built-in function for sending emails.
// Returns true on success, false on failure.

$mailSent = mail($receiverEmail, $emailSubject, $body, $headers);


// ─── 9. REDIRECT THE USER ──────────────────────────────────────
// After processing, we redirect the user back to the contact page
// with a query parameter (?status=success or ?status=error).
// This prevents double-submission if the user refreshes the page.
//
// The Referer header tells us which page the form was submitted from,
// so we redirect back to the correct language version (EN or CS).

$referer = $_SERVER['HTTP_REFERER'] ?? '/contact.html';

if ($mailSent) {
    header("Location: {$referer}?status=success");
} else {
    header("Location: {$referer}?status=error");
}
exit;
// exit stops the script — nothing below this line runs.
// It's important after header('Location: ...') because
// the redirect is just an instruction to the browser;
// PHP would keep executing without exit.
