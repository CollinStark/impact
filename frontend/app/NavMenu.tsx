"use client";
import Link from "next/link";
import Image from "next/image";

import { usePathname } from "next/navigation";

import React from "react";

export default function NavMenu() {
  const pathname = usePathname();
  const isHomePage = pathname === "/";
  const navbarClasses = isHomePage
    ? "navbar fixed inset-x-0 top-0 flex flex-row justify-between z-10 bg-white backdrop-filter backdrop-blur-lg bg-opacity-50"
    : "navbar";

  return (
    <div className={navbarClasses}>
      <div className="flex-1">
        <Link href={"/"} className="btn btn-ghost cursor-pointer">
          <Image
            src="/logo_trans.png"
            width={55}
            height={40}
            alt="IMPACT Logo"
          />
          <div className="font-title inline-flex text-lg md:text-2xl">
            IMPACT
          </div>
        </Link>
      </div>

      <div className="flex-none mr-4">
        <ul className="menu menu-horizontal px-1">
          <li>
            <Link
              href={"/targeted"}
              className={pathname === "/targeted" ? " font-bold" : ""}
            >
              Targeted Analysis
            </Link>
          </li>

          <li>
            <Link
              href={"/preprocessing"}
              className={pathname === "/preprocessing" ? " font-bold" : ""}
            >
              LC-MS Preprocessing
            </Link>
          </li>
          <li>
            <Link
              href={"/mid-calculation"}
              className={pathname === "/mid-calculation" ? " font-bold" : ""}
            >
              MID Calculation
            </Link>
          </li>
          <li>
            <Link
              href={"/contextualization"}
              className={pathname === "/contextualization" ? " font-bold" : ""}
            >
              Contextualization
            </Link>
          </li>

          <li>
            <Link
              href={"/docs"}
              className={pathname === "/docs" ? " font-bold" : ""}
            >
              Documentation
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
