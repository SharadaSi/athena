<?php
/**
 * ============================================================
 * NEWSLETTER FORM HANDLER - PHP Script for Ecomail Integration
 * ============================================================
 * 
 * This script processes newsletter subscription requests from your website.
 * It validates form data, sends subscriber information to the Ecomail API,
 * logs the subscription, and sends a confirmation email.
 * 
 * Flow: HTML Form → This Script → Ecomail API → CSV Log → Email Notification
 */

// Set the response format to JSON (structured data format)
// This tells the browser to expect JSON data, not HTML
header('Content-Type: application/json');

// ============================================================
// CORS (Cross-Origin Resource Sharing) - SECURITY HEADERS
// ============================================================
// These headers allow your form to be submitted from any website/domain
// WARNING: Using '*' is permissive for security. Consider restricting to your domain.

// Allow requests from any origin (domain)
// Change '*' to your specific domain like 'https://czechalert.com' for better security
header('Access-Control-Allow-Origin: https://czechalert.com');

// Specify which HTTP methods (GET, POST, etc.) are allowed
header('Access-Control-Allow-Methods: POST, OPTIONS');

// Specify which headers the client is allowed to send
// Content-Type is needed to send JSON data
header('Access-Control-Allow-Headers: Content-Type');

// ============================================================
// HANDLE CORS PREFLIGHT REQUEST
// ============================================================
// Before sending actual data, browsers send an OPTIONS request to check if 
// the server allows cross-origin requests. We must respond with status 200 (OK).
// This is automatic - you don't need to do anything on the frontend.

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    // Respond with 200 OK status code
    http_response_code(200);
    // Exit the script here - don't process further
    exit;
}

// ============================================================
// VERIFY THE REQUEST METHOD IS POST
// ============================================================
// We only accept POST requests (used for sending data)
// If someone tries to access with GET or other methods, reject it
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    // Send 405 (Method Not Allowed) error
    http_response_code(405);
    // Return JSON error message
    echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
    exit;
}

// ============================================================
// ECOMAIL API CONFIGURATION
// ============================================================
// These are your API credentials to connect to Ecomail service.
// API Key: Authentication token that identifies your Ecomail account
// List ID: The specific subscriber list you want to add people to

// Get this from Ecomail → Settings → API
// Keep this secret! Don't share it or commit to public repositories
define('ECOMAIL_API_KEY', '967d8b61a7fd629ec72d1661070bd30b1a28384bd366052cb12afea46012c416');

// Get this from Ecomail → Lists → View list details
// Usually '1' for the default list, but check your Ecomail account
define('ECOMAIL_LIST_ID', '1');

// ============================================================
// EXTRACT AND CLEAN FORM DATA
// ============================================================
// Retrieve data from the POST request (form submission)
// The '??' (null coalescing operator) provides a default value if the key doesn't exist
// trim() removes whitespace from beginning and end of the string

// Get the 'name' field from the form, remove extra spaces
$name  = trim($_POST['name']  ?? '');

// Get the 'email' field from the form, remove extra spaces
$email = trim($_POST['email'] ?? '');

// ============================================================
// VALIDATE FORM DATA (IMPORTANT FOR SECURITY)
// ============================================================
// Check that both fields are filled in and email is valid
// This prevents empty submissions and invalid email addresses

if ($name === '' || $email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    // If validation fails, send error response as JSON
    echo json_encode(['success' => false, 'message' => 'Invalid name or email.']);
    // Stop script execution here – don't continue
    exit;
}

// ============================================================
// SPLIT FULL NAME INTO FIRST AND LAST NAME
// ============================================================
// The explode() function splits a string into parts using a separator (space)
// The '2' parameter means: split into at most 2 parts
// Example: "John Doe" becomes ["John", "Doe"]

// Split the full name by space - maximum 2 parts
$nameParts = explode(' ', $name, 2);

// Get the first part (first name)
$firstName = $nameParts[0];

// Get the second part (last name), or empty string if no second part exists
$lastName  = $nameParts[1] ?? '';

// ============================================================
// FUNCTION TO SEND SUBSCRIBER DATA TO ECOMAIL API
// ============================================================
// Functions are reusable blocks of code. This one handles all communication
// with the Ecomail API (the external email service).
// 
// Parameters (inputs):
//   - $email: subscriber's email address
//   - $firstName: subscriber's first name
//   - $lastName: subscriber's last name

function sendToEcomail($email, $firstName, $lastName) {
    // Build the API endpoint URL (where we'll send the data)
    // According to Ecomail v2 docs: POST https://api2.ecomailapp.cz/lists/{list_id}/subscribe
    // The '.' operator concatenates (joins) strings together
    $url = 'https://api2.ecomailapp.cz/lists/' . ECOMAIL_LIST_ID . '/subscribe';
    
    // Prepare the data to send to Ecomail
    // This is an associative array (like a dictionary with key-value pairs)
    $data = [
        // subscriber_data contains the person's information
        'subscriber_data' => [
            'email' => $email,              // Their email address
            'name' => $firstName,           // Their first name
            'surname' => $lastName,         // Their last name
            // You can add more custom fields here:
            // 'phone' => '',              // Example: phone number
            // 'company' => '',            // Example: company name
            // 'custom_field' => '',       // Add any custom fields
        ],
        // Options for how Ecomail should handle this subscription:
        'trigger_autoresponders' => true,  // Send automated welcome emails
        'update_existing' => true,         // Update if email already exists
        'resubscribe' => true              // Re-subscribe if they were unsubscribed before
    ];
    
    // ============================================================
    // SEND REQUEST TO ECOMAIL API USING CURL
    // ============================================================
    // cURL is a tool for sending HTTP requests (like form submissions)
    // Think of it as a programmatic way to "submit" data to a web server
    
    // Initialize a cURL session to the API endpoint
    $ch = curl_init($url);
    
    // Set configuration options for this cURL request
    // CURLOPT_ prefix means "cURL option"
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,    // Return response as string, don't print it
        CURLOPT_POST => true,              // Use POST method (not GET)
        CURLOPT_POSTFIELDS => json_encode($data),  // Convert array to JSON and send it
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',       // Tell server we're sending JSON
            'key: ' . ECOMAIL_API_KEY               // Authentication: API key
        ],
        CURLOPT_TIMEOUT => 10              // Wait max 10 seconds for response
    ]);
    
    // ============================================================
    // EXECUTE REQUEST AND GET RESPONSE
    // ============================================================
    
    // Execute the cURL request and get the response
    $response = curl_exec($ch);
    
    // Get the HTTP status code (200, 404, 500, etc.)
    // 2xx codes mean success, 4xx/5xx mean errors
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    
    // Get any error that occurred during the request
    // Empty string if no error happened
    $curlError = curl_error($ch);
    
    // Close the cURL connection (free up resources)
    curl_close($ch);
    
    // Return an array with all the information about the response
    // This helps the calling code understand if it succeeded or failed
    return [
        // Success = true if HTTP code is 200-299 (success range)
        'success' => ($httpCode >= 200 && $httpCode < 300),
        // The HTTP status code number
        'httpCode' => $httpCode,
        // Decode JSON response to PHP array (true parameter)
        'response' => json_decode($response, true),
        // Any error message from cURL
        'error' => $curlError
    ];
}

// ============================================================
// CALL THE ECOMAIL FUNCTION
// ============================================================
// Execute the sendToEcomail function with the subscriber's data
$ecomailResult = sendToEcomail($email, $firstName, $lastName);

// ============================================================
// CHECK IF ECOMAIL REQUEST WAS SUCCESSFUL
// ============================================================
// The '!' means "NOT" – so this runs if success is FALSE
if (!$ecomailResult['success']) {
    // Log detailed error information for debugging
    // This writes to the PHP error log (usually server logs)
    // sprintf formats a string with variables inserted
    error_log(sprintf(
        'Ecomail API Error: HTTP %d, Response: %s, Error: %s',
        $ecomailResult['httpCode'],
        json_encode($ecomailResult['response']),
        $ecomailResult['error']
    ));
    
    // Send error response to the client (browser/frontend)
    echo json_encode([
        'success' => false, 
        'message' => 'Failed to subscribe to newsletter. Please try again later.'
    ]);
    // Stop script execution – don't run the remaining code
    exit;
}

// ============================================================
// BACKUP CSV LOG (Optional – saves subscriber data locally)
// ============================================================
// This creates a CSV file as a backup of all subscribers
// CSV = Comma-Separated Values (can be opened in Excel, Google Sheets, etc.)

// __DIR__ = the directory of this PHP file
// Build path to the subscribers.csv file
$logFile = __DIR__ . '/subscribers.csv';

// If the CSV file doesn't exist yet, create it with headers
if (!file_exists($logFile)) {
    // Create file with column headers
    file_put_contents($logFile, "Name,Email,Date,EcomailStatus\n");
}

// Append a new line to the CSV file
file_put_contents(
    $logFile,
    // sprintf formats the data as CSV (quoted fields separated by commas)
    sprintf('"%s","%s","%s","%s"%s', 
        $name,                              // Subscriber's full name
        $email,                             // Subscriber's email
        date('Y-m-d H:i:s'),                // Current date and time
        'success',                          // Status (all successful here)
        PHP_EOL                             // Line ending (new line)
    ),
    // FILE_APPEND = add to the end of the file
    // LOCK_EX = lock file while writing (prevents multiple writes at once)
    FILE_APPEND | LOCK_EX
);

// ============================================================
// SEND NOTIFICATION EMAIL (Optional – notifies admin of new subscriber)
// ============================================================
// This sends an email to the site admin informing them of the new subscription

// Email recipient (admin's email address)
$to      = 'info@czechalert.com';

// Email subject line
$subject = 'New Newsletter Subscriber via Ecomail';

// Email body – the actual message
// The \n creates line breaks in the message
// {$variable} allows us to insert variables directly in strings
$message = "New subscriber added to Ecomail:\n"        // Line break: \n
    . "Name: {$name}\n"
    . "Email: {$email}\n"
    . "IP: {$_SERVER['REMOTE_ADDR']}\n"              // Get visitor's IP address
    . "Time: " . date('Y-m-d H:i:s');                // Current date/time

// Email headers (metadata about the email)
$headers = [
    'From: noreply@czechalert.com',                 // Sender address
    'Reply-To: ' . $email,                          // Reply goes to subscriber
    'X-Mailer: PHP/' . phpversion(),                // Identify this as PHP email
];

// Send the email using PHP's mail() function
// implode() joins the headers array with \r\n (standard line endings)
mail($to, $subject, $message, implode("\r\n", $headers));

// ============================================================
// SEND SUCCESS RESPONSE TO CLIENT
// ============================================================
// If we got here, everything succeeded! Send success JSON response
// The frontend (JavaScript) will read this and show success message

echo json_encode([
    'success' => true,                                  // Flag: subscription was successful
    'message' => 'Successfully subscribed to newsletter!' // Message to display to user
]);

// End of PHP script
?>