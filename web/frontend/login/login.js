const loginSection = document.getElementById("loginSection");
const registerSection = document.getElementById("registerSection");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const loginButton = document.getElementById("loginButton");
const registerButton = document.getElementById("registerButton");

const loginMessage = document.getElementById("loginMessage");
const registerMessage = document.getElementById("registerMessage");


function showLogin() {

    loginSection.classList.remove("hidden");
    registerSection.classList.add("hidden");

    clearMessages();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


function showRegister() {

    loginSection.classList.add("hidden");
    registerSection.classList.remove("hidden");

    clearMessages();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


function clearMessages() {

    loginMessage.textContent = "";
    loginMessage.className = "message";

    registerMessage.textContent = "";
    registerMessage.className = "message";
}


function showLoginMessage(message, type) {

    loginMessage.textContent = message;
    loginMessage.className = "message " + type;
}


function showRegisterMessage(message, type) {

    registerMessage.textContent = message;
    registerMessage.className = "message " + type;
}


function setButtonLoading(button, loading, normalText) {

    if (loading) {

        button.disabled = true;
        button.textContent = "Please wait...";

    } else {

        button.disabled = false;
        button.textContent = normalText;
    }
}


// ============================================================
// LOGIN
// ============================================================

loginForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    clearMessages();

    const email = document
        .getElementById("loginEmail")
        .value
        .trim();

    const password = document
        .getElementById("loginPassword")
        .value;


    if (!email || !password) {

        showLoginMessage(
            "Enter your email and password.",
            "error"
        );

        return;
    }


    setButtonLoading(
        loginButton,
        true,
        "Login"
    );


    try {

        const response = await fetch(
            "/api/login",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                credentials: "include",

                body: JSON.stringify({
                    email: email,
                    password: password
                })
            }
        );


        const data = await response.json();


        if (!response.ok || !data.success) {

            showLoginMessage(
                data.message || "Login failed.",
                "error"
            );

            setButtonLoading(
                loginButton,
                false,
                "Login"
            );

            return;
        }


        showLoginMessage(
            "Login successful. Redirecting...",
            "success"
        );


        setTimeout(function() {

            window.location.href = "/";

        }, 500);


    } catch (error) {

        console.error(error);

        showLoginMessage(
            "Unable to connect to server.",
            "error"
        );

        setButtonLoading(
            loginButton,
            false,
            "Login"
        );
    }

});


// ============================================================
// REGISTER
// ============================================================

registerForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    clearMessages();


    const name = document
        .getElementById("registerName")
        .value
        .trim();

    const email = document
        .getElementById("registerEmail")
        .value
        .trim();

    const password = document
        .getElementById("registerPassword")
        .value;

    const confirmPassword = document
        .getElementById("registerConfirmPassword")
        .value;


    if (!name) {

        showRegisterMessage(
            "Enter your full name.",
            "error"
        );

        return;
    }


    if (!email || !email.includes("@")) {

        showRegisterMessage(
            "Enter a valid email.",
            "error"
        );

        return;
    }


    if (password.length < 6) {

        showRegisterMessage(
            "Password must be at least 6 characters.",
            "error"
        );

        return;
    }


    if (password !== confirmPassword) {

        showRegisterMessage(
            "Passwords do not match.",
            "error"
        );

        return;
    }


    setButtonLoading(
        registerButton,
        true,
        "Create Account"
    );


    try {

        const response = await fetch(
            "/api/register",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                credentials: "include",

                body: JSON.stringify({
                    name: name,
                    email: email,
                    password: password
                })
            }
        );


        const data = await response.json();


        if (!response.ok || !data.success) {

            showRegisterMessage(
                data.message || "Account creation failed.",
                "error"
            );

            setButtonLoading(
                registerButton,
                false,
                "Create Account"
            );

            return;
        }


        showRegisterMessage(
            "Account created. Redirecting...",
            "success"
        );


        setTimeout(function() {

            window.location.href = "/";

        }, 500);


    } catch (error) {

        console.error(error);

        showRegisterMessage(
            "Unable to connect to server.",
            "error"
        );

        setButtonLoading(
            registerButton,
            false,
            "Create Account"
        );
    }

});


// ============================================================
// GOOGLE LOGIN
// ============================================================

function googleLogin() {

    window.location.href = "/auth/google";
}


// ============================================================
// CHECK EXISTING LOGIN
// ============================================================

async function checkExistingLogin() {

    try {

        const response = await fetch(
            "/api/me",
            {
                method: "GET",
                credentials: "include"
            }
        );


        if (!response.ok) {
            return;
        }


        const data = await response.json();


        if (data.logged_in) {

            window.location.href = "/";

        }

    } catch (error) {

        console.log(
            "No active VISMYTH session."
        );
    }
}


document.addEventListener(
    "DOMContentLoaded",
    function() {

        checkExistingLogin();

    }
);