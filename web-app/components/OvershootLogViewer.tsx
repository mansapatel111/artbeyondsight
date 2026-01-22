"use client";

import { useEffect, useState } from "react";

interface LogEntry {
    timestamp: string;
    type: "info" | "detection" | "guidance" | "error";
    message: string;
    data?: any;
}

export function OvershootLogViewer() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        // Override console.log to capture Overshoot logs
        const originalLog = console.log;
        const originalError = console.error;

        console.log = (...args: any[]) => {
            originalLog(...args);

            const message = args.join(" ");
            const timestamp = new Date().toLocaleTimeString();

            let type: LogEntry["type"] = "info";
            if (message.includes("PAINTING DETECTED")) {
                type = "detection";
            } else if (message.includes("GUIDANCE")) {
                type = "guidance";
            }

            setLogs((prev) => [
                {
                    timestamp,
                    type,
                    message,
                    data: args.length > 1 ? args.slice(1) : undefined,
                },
                ...prev.slice(0, 99), // Keep last 100 logs
            ]);
        };

        console.error = (...args: any[]) => {
            originalError(...args);

            const message = args.join(" ");
            const timestamp = new Date().toLocaleTimeString();

            setLogs((prev) => [
                {
                    timestamp,
                    type: "error",
                    message,
                    data: args.length > 1 ? args.slice(1) : undefined,
                },
                ...prev.slice(0, 99),
            ]);
        };

        return () => {
            console.log = originalLog;
            console.error = originalError;
        };
    }, []);

    if (!isExpanded) {
        return (
            <button
                onClick={() => setIsExpanded(true)}
                className="fixed bottom-4 right-4 bg-gray-900 text-white px-4 py-2 rounded-full shadow-lg hover:bg-gray-800 transition-all z-50"
            >
                📊 View Logs ({logs.length})
            </button>
        );
    }

    return (
        <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-2xl border border-gray-300 w-96 max-h-96 overflow-hidden z-50 flex flex-col">
            <div className="bg-gray-900 text-white px-4 py-2 flex justify-between items-center">
                <h3 className="font-bold">Overshoot Logs</h3>
                <button
                    onClick={() => setIsExpanded(false)}
                    className="text-white hover:text-gray-300"
                >
                    ✕
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
                {logs.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">
                        No logs yet. Start the camera to see logs.
                    </p>
                ) : (
                    logs.map((log, index) => (
                        <div
                            key={index}
                            className={`text-xs p-2 rounded ${log.type === "detection"
                                    ? "bg-green-100 border-l-4 border-green-500"
                                    : log.type === "guidance"
                                        ? "bg-blue-100 border-l-4 border-blue-500"
                                        : log.type === "error"
                                            ? "bg-red-100 border-l-4 border-red-500"
                                            : "bg-gray-100 border-l-4 border-gray-400"
                                }`}
                        >
                            <div className="flex justify-between items-start gap-2">
                                <span className="text-gray-600 text-[10px] whitespace-nowrap">
                                    {log.timestamp}
                                </span>
                                <span className="flex-1 break-words">{log.message}</span>
                            </div>
                            {log.data && (
                                <pre className="mt-1 text-[10px] text-gray-700 overflow-x-auto">
                                    {JSON.stringify(log.data, null, 2)}
                                </pre>
                            )}
                        </div>
                    ))
                )}
            </div>

            <div className="bg-gray-100 px-4 py-2 border-t border-gray-200 flex justify-between">
                <button
                    onClick={() => setLogs([])}
                    className="text-xs text-gray-600 hover:text-gray-900"
                >
                    Clear Logs
                </button>
                <span className="text-xs text-gray-500">{logs.length} entries</span>
            </div>
        </div>
    );
}
