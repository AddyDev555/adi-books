"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    BookOpen,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Menu,
    X,
} from "lucide-react";

const menuItems = [
    {
        name: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
    },
    {
        name: "Manual Entries",
        href: "/manual-entries",
        icon: BookOpen,
    },
];

export default function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
                className="fixed left-4 top-4 z-40 rounded-lg border border-slate-200 bg-white p-2.5 text-slate-700 shadow-sm md:hidden"
            >
                <Menu size={20} />
            </button>
            {mobileOpen && <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" className="fixed inset-0 z-40 bg-slate-950/30 md:hidden" />}
            <aside
                className={`
                fixed left-0 top-0 z-50 flex h-screen flex-col
                border-r border-gray-200
                bg-white
                transition-all duration-300
                ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
                ${collapsed ? "w-16" : "w-72 md:w-[260px]"}
            `}
            >
            {/* ================= LOGO ================= */}
            <div
                className={`
                    flex h-16 items-center
                    border-b border-gray-200
                    ${collapsed ? "justify-center" : "px-5"}
                `}
            >
                <Link
                    href="/dashboard"
                    className="flex items-center gap-3"
                >
                    <div
                        className="
                            flex h-9 w-9 items-center justify-center
                            rounded-lg
                            bg-[#000080]
                            text-sm font-bold text-white
                        "
                    >
                        A
                    </div>

                    {!collapsed && (
                        <span
                            className="inline
                                text-lg font-semibold
                                tracking-tight
                                text-black
                            "
                        >
                            Adi-books
                        </span>
                    )}
                </Link>
                <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="absolute right-4 top-5 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 md:hidden"><X size={18} /></button>
            </div>

            {/* ================= NAVIGATION ================= */}
            <nav className="flex-1 px-3 py-6">
                {!collapsed && (
                    <p
                        className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400
                        "
                    >
                        Workspace
                    </p>
                )}

                <div className="space-y-1">
                    {menuItems.map((item) => {
                        const Icon = item.icon;

                        const isActive =
                            pathname === item.href ||
                            pathname.startsWith(`${item.href}/`);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className={`
                                    group flex items-center gap-3
                                    rounded-lg
                                    px-3 py-2.5
                                    text-sm font-medium
                                    transition-all duration-150
                                    ${isActive
                                        ? "bg-[#000080] text-white"
                                        : "text-gray-600 hover:bg-gray-100 hover:text-black"
                                    }
                                    ${collapsed ? "justify-center" : ""}
                                `}
                            >
                                <Icon
                                    size={19}
                                    strokeWidth={1.8}
                                    className={
                                        isActive
                                            ? "text-white"
                                            : "text-gray-500 group-hover:text-[#000080]"
                                    }
                                />

                                {!collapsed && (
                                    <span className="inline">{item.name}</span>
                                )}
                            </Link>
                        );
                    })}
                </div>
            </nav>

            {/* ================= PROFILE ================= */}
            <div className="border-t border-gray-200 p-3">
                {/* Collapse */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className={`
                        mt-2 flex w-full
                        items-center justify-center
                        rounded-lg p-2.5
                        text-gray-500
                        transition-colors
                        hover:bg-gray-100
                        hover:text-[#000080]
                    `}
                    aria-label={
                        collapsed
                            ? "Expand sidebar"
                            : "Collapse sidebar"
                    }
                >
                    {collapsed ? (
                        <ChevronRight size={18} />
                    ) : (
                        <ChevronLeft size={18} />
                    )}
                </button>
                <div
                    className={`
                        flex items-center rounded-lg
                        p-2
                        transition-colors
                        hover:bg-gray-100
                        ${collapsed ? "justify-center" : "gap-3"}
                    `}
                >
                    {/* Avatar */}
                    <div
                        className="
                            flex h-9 w-9 shrink-0
                            items-center justify-center
                            rounded-full
                            bg-[#000080]
                            text-sm font-semibold
                            text-white
                        "
                    >
                        AP
                    </div>

                    {!collapsed && (
                        <>
                            {/* User information */}
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-black">
                                    Aditya Patil
                                </p>

                                <p className="truncate text-xs text-gray-500">
                                    Administrator
                                </p>
                            </div>

                            <button
                                type="button"
                                className="
                                    rounded-md p-1
                                    text-gray-400
                                    hover:bg-gray-200
                                    hover:text-black
                                "
                            >
                                <ChevronDown size={16} />
                            </button>
                        </>
                    )}
                </div>

            </div>
            </aside>
        </>
    );
}