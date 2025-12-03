<?php
// filepath: c:\Users\admin\OneDrive\Plocha\CODE\CZECH ALERT WEB\formhandler.php
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Invalid request method.']);
    exit;
}

// read raw POST body (handles application/json or form data)
$rawBody = file_get_contents('php://input');
parse_str($rawBody, $parsedBody);

$name  = trim($parsedBody['name']  ?? $_POST['name']  ?? '');
$email = trim($parsedBody['email'] ?? $_POST['email'] ?? '');

if ($name === '' || $email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['success' => false, 'message' => 'Invalid name or email.']);
    exit;
}

// optional CSV log
$logFile = __DIR__ . '/subscribers.csv';
if (!file_exists($logFile)) {
    file_put_contents($logFile, "Name,Email,Date\n");
}
file_put_contents(
    $logFile,
    sprintf('"%s","%s","%s"%s', $name, $email, date('Y-m-d H:i:s'), PHP_EOL),
    FILE_APPEND | LOCK_EX
);

// send notification email
$to      = 'info@czechalert.com';
$subject = 'New Newsletter Subscriber';
$message = "New subscriber:\nName: {$name}\nEmail: {$email}\nIP: {$_SERVER['REMOTE_ADDR']}\nTime: " . date('Y-m-d H:i:s');
$headers = [
    'From: noreply@czechalert.com',
    'Reply-To: ' . $email,
    'X-Mailer: PHP/' . phpversion(),
];

if (mail($to, $subject, $message, implode("\r\n", $headers))) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'message' => 'Email send failed.']);
}
?>