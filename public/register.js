"use strict";

document.addEventListener("DOMContentLoaded", () => {

    const registerForm =
        document.getElementById("registerForm");

    const usernameInput =
        document.getElementById("username");

    const passwordInput =
        document.getElementById("password");

    const confirmPasswordInput =
        document.getElementById("confirmPassword");

    const registerButton =
        document.getElementById("registerButton");

    const registerButtonText =
        document.getElementById("registerButtonText");

    const registerLoading =
        document.getElementById("registerLoading");

    const registerMessage =
        document.getElementById("registerMessage");

    const togglePassword =
        document.getElementById("togglePassword");

    const toggleConfirmPassword =
        document.getElementById(
            "toggleConfirmPassword"
        );


    /* =====================================================
       MESSAGE
    ===================================================== */

    function showMessage(
        message,
        type = "error"
    ) {

        if (!registerMessage) {
            return;
        }

        registerMessage.textContent =
            message || "";

        registerMessage.style.color =
            type === "success"
                ? "#4ade80"
                : "#ff5269";
    }


    /* =====================================================
       LOADING
    ===================================================== */

    function setLoading(loading) {

        if (registerButton) {
            registerButton.disabled =
                loading;
        }

        if (registerButtonText) {

            registerButtonText.classList.toggle(
                "hidden",
                loading
            );

        }

        if (registerLoading) {

            registerLoading.classList.toggle(
                "hidden",
                !loading
            );

        }

        if (usernameInput) {
            usernameInput.disabled =
                loading;
        }

        if (passwordInput) {
            passwordInput.disabled =
                loading;
        }

        if (confirmPasswordInput) {
            confirmPasswordInput.disabled =
                loading;
        }
    }


    /* =====================================================
       PASSWORD TOGGLE
    ===================================================== */

    function setupPasswordToggle(
        button,
        input
    ) {

        if (!button || !input) {
            return;
        }

        button.addEventListener(
            "click",
            () => {

                const hidden =
                    input.type === "password";

                input.type =
                    hidden
                        ? "text"
                        : "password";

                button.textContent =
                    hidden
                        ? "Ẩn"
                        : "Hiện";

            }
        );
    }


    setupPasswordToggle(
        togglePassword,
        passwordInput
    );

    setupPasswordToggle(
        toggleConfirmPassword,
        confirmPasswordInput
    );


    /* =====================================================
       VALIDATE USERNAME
    ===================================================== */

    function validateUsername(
        username
    ) {

        if (!username) {

            return "Vui lòng nhập username.";

        }

        if (
            username.length < 3 ||
            username.length > 20
        ) {

            return "Username phải từ 3 đến 20 ký tự.";

        }

        if (
            !/^[a-zA-Z0-9_]+$/.test(
                username
            )
        ) {

            return "Username chỉ được dùng chữ, số và dấu _.";

        }

        return null;
    }


    /* =====================================================
       VALIDATE PASSWORD
    ===================================================== */

    function validatePassword(
        password
    ) {

        if (!password) {

            return "Vui lòng nhập mật khẩu.";

        }

        if (password.length < 6) {

            return "Mật khẩu phải có ít nhất 6 ký tự.";

        }

        return null;
    }


    /* =====================================================
       REGISTER
    ===================================================== */

    if (registerForm) {

        registerForm.addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                showMessage("");

                const username =
                    usernameInput
                        ?.value
                        .trim() || "";

                const password =
                    passwordInput
                        ?.value || "";

                const confirmPassword =
                    confirmPasswordInput
                        ?.value || "";


                /* -----------------------------------------
                   USERNAME
                ----------------------------------------- */

                const usernameError =
                    validateUsername(
                        username
                    );

                if (usernameError) {

                    showMessage(
                        usernameError
                    );

                    usernameInput?.focus();

                    return;
                }


                /* -----------------------------------------
                   PASSWORD
                ----------------------------------------- */

                const passwordError =
                    validatePassword(
                        password
                    );

                if (passwordError) {

                    showMessage(
                        passwordError
                    );

                    passwordInput?.focus();

                    return;
                }


                /* -----------------------------------------
                   CONFIRM
                ----------------------------------------- */

                if (!confirmPassword) {

                    showMessage(
                        "Vui lòng xác nhận mật khẩu."
                    );

                    confirmPasswordInput?.focus();

                    return;
                }


                if (
                    password !==
                    confirmPassword
                ) {

                    showMessage(
                        "Mật khẩu xác nhận không khớp."
                    );

                    confirmPasswordInput?.focus();

                    return;
                }


                setLoading(true);


                try {

                    const response =
                        await fetch(
                            "/api/register",
                            {
                                method: "POST",

                                credentials:
                                    "include",

                                headers: {
                                    "Content-Type":
                                        "application/json"
                                },

                                body:
                                    JSON.stringify({
                                        username,
                                        password
                                    })
                            }
                        );


                    let data = {};

                    try {

                        data =
                            await response.json();

                    } catch {

                        data = {};

                    }


                    if (!response.ok) {

                        throw new Error(
                            data.message ||
                            "Không thể tạo tài khoản."
                        );

                    }


                    if (!data.success) {

                        throw new Error(
                            data.message ||
                            "Không thể tạo tài khoản."
                        );

                    }


                    showMessage(
                        "Tạo tài khoản thành công. Đang vào M4 Chat...",
                        "success"
                    );


                    if (registerButtonText) {

                        registerButtonText.textContent =
                            "Đang vào M4 Chat...";

                        registerButtonText.classList.remove(
                            "hidden"
                        );

                    }

                    if (registerLoading) {

                        registerLoading.classList.add(
                            "hidden"
                        );

                    }


                    /*
                     * Server đã tạo cookie JWT.
                     * Chuyển thẳng vào trang chính.
                     */

                    setTimeout(
                        () => {

                            window.location.replace(
                                "/"
                            );

                        },
                        500
                    );


                } catch (error) {

                    console.error(
                        "Register error:",
                        error
                    );

                    showMessage(
                        error.message ||
                        "Không thể kết nối máy chủ."
                    );

                    setLoading(false);

                }

            }
        );

    }


    /* =====================================================
       CLEAR MESSAGE WHILE TYPING
    ===================================================== */

    [
        usernameInput,
        passwordInput,
        confirmPasswordInput
    ]
        .forEach(
            input => {

                input?.addEventListener(
                    "input",
                    () => {

                        if (
                            registerMessage
                        ) {

                            registerMessage.textContent =
                                "";

                        }

                    }
                );

            }
        );


    /* =====================================================
       USERNAME AUTO CLEAN
    ===================================================== */

    usernameInput?.addEventListener(
        "input",
        () => {

            /*
             * Không tự sửa nội dung người dùng nhập.
             * Chỉ kiểm tra khi submit để tránh gây khó chịu.
             */

        }
    );


    /* =====================================================
       INITIAL FOCUS
    ===================================================== */

    usernameInput?.focus();


    console.log(
        "M4 Chat register.js loaded."
    );

});
