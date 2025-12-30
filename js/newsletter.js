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
            const response = await fetch("formhandler.php", {
                method: "POST",
                headers: { "Content-Type" : "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ name: nameValue, email: emailValue})
            });

            const data = await response.json();

            if(data.success) {
                showMessage("Thank you! You have been subscribed.", "success");
                newsletterForm.reset();
            } else {
                showMessage(data.message || "Subscription failed. Please try again", "error");
                console.log("Subscription failed. Please try again");
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
