document.addEventListener("DOMContentLoaded", () => {
    const newsletterForm = document.getElementById('newsletterForm');
    if (!newsletterForm) return;

    newsletterForm.reset(); //clears any values the browser might autofill
    window.addEventListener("pageshow", (event) => { //page is shown from cache
        if (event.persisted) newsletterForm.reset(); //clears any residual values again
    })

    const statusMessage = document.getElementById('message');
    const subscribeBtn = document.getElementById('subscribeBtn');

    newsletterForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const nameValue = document.getElementById("name").value.trim();
        const emailValue = document.getElementById("email").value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;



        if (!nameValue || !emailValue) {
            showMessage("Please fill in all the fields", "error");
            console.log("Please fill in all the fields");
            return;
        }

        if (!emailRegex.test(emailValue)) {
            showMessage("Please enter a valid email address", "error");
            console.log("Please enter a valid email address");
            return;
        }

        subscribeBtn.disabled = true;
        subscribeBtn.textContent = "Subscribing...";

        try {
            const endpoint = newsletterForm.action || "formhandler.php";
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json"
                },
                body: new URLSearchParams({ name: nameValue, email: emailValue })
            });

            let data = null;
            try {
                data = await response.json();
            } catch (parseErr) {
                // Non-JSON response (e.g., 404 HTML) will land here
            }

            if (!response.ok) {
                const msg = (data && data.message) || `Subscription failed (HTTP ${response.status}).`;
                showMessage(msg, "error");
                console.log(msg);
                return;
            }

            if (data && data.success) {
                showMessage("Thank you! You have been subscribed.", "success");
                newsletterForm.reset();
            } else {
                const msg = (data && data.message) || "Subscription failed. Please try again";
                showMessage(msg, "error");
                console.log(msg);
            }
        } catch (error) {
            showMessage("Network error. Please check your connection", "error");
            console.log("Network error. Check your connection");
        } finally {
            subscribeBtn.disabled = false;
            subscribeBtn.textContent = "Subscribe"
        }
    });

    function showMessage(text, type) {
        statusMessage.textContent = text;
        statusMessage.className = `message ${type}`;
        statusMessage.classList.remove("hidden");

        setTimeout( () => {
            statusMessage.classList.add("hidden");
        }, 5000);
    }
})
