import { useState, useCallback, useEffect } from "react";

interface UserData {
    userId: string;
    token: string;
    expiration: string;
}

let logoutTimer: ReturnType<typeof setTimeout> | undefined;

interface AuthHook {
    userId: string | null;
    token: string | null;
    login: (uid: string, token: string, expDate?: Date) => void;
    logout: () => void;
}

export default function useAuth(): AuthHook {
    const [token, setToken] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [tokenExpDate, setTokenExpDate] = useState<Date | null>(null);

    const login = useCallback(
        (uid: string, newToken: string, expDate?: Date) => {
            const expirationDate =
                expDate || new Date(new Date().getTime() + 1000 * 60 * 60);

            setToken(newToken);
            setUserId(uid);
            setTokenExpDate(expirationDate);

            localStorage.setItem(
                "user",
                JSON.stringify({
                    userId: uid,
                    token: newToken,
                    expiration: expirationDate.toISOString(),
                } as UserData)
            );
        },
        [] 
    );

    const logout = useCallback(() => {
        setToken(null);
        setUserId(null);
        setTokenExpDate(null);
        localStorage.removeItem("user");

        if (logoutTimer) {
            clearTimeout(logoutTimer);
        }
    }, []);

    useEffect(() => {
        if (token && tokenExpDate) {
            const remainingTime = tokenExpDate.getTime() - new Date().getTime();

            logoutTimer = setTimeout(logout, remainingTime);
        } else {
            if (logoutTimer) {
                clearTimeout(logoutTimer);
            }
        }
    }, [token, logout, tokenExpDate]);


    useEffect(() => {
        const storedDataString = localStorage.getItem("user");
        if (!storedDataString) return;

        try {
            const storedData: UserData = JSON.parse(storedDataString);
            const expirationDate = new Date(storedData.expiration);

            if (storedData.token && expirationDate > new Date()) {
                login(storedData.userId, storedData.token, expirationDate);
            }
        } catch (error) {
            console.error("Failed to parse user data from storage:", error);
            localStorage.removeItem("user");
        }
    }, [login]);

    return { userId, token, login, logout };
}