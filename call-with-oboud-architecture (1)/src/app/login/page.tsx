"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { MobileAuthPage } from "@/components/MobileAuthPage";
import type { PublicUser } from "@/types/oboud";

export default function LoginPage() {
  const router = useRouter();

  const handleAuthenticated = (
    _user: PublicUser,
    token: string,
    rememberDevice: boolean
  ) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("oboud_tab_jwt", token);
      if (rememberDevice) {
        window.localStorage.setItem("oboud_saved_jwt", token);
      } else {
        window.localStorage.removeItem("oboud_saved_jwt");
      }
    }
    router.push("/");
  };

  return (
    <MobileAuthPage
      demoUsers={[]}
      onAuthenticated={handleAuthenticated}
    />
  );
}
