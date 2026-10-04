import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { FiSearch } from "react-icons/fi"

import ComponentsList from "../../components/Workflows/ComponentsList"

export const Route = createFileRoute("/_layout/components")({
  component: Components,
})

function Components() {
  const [searchQuery, setSearchQuery] = useState("")

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-gray-50 transition-colors dark:bg-app-bg">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden px-8 pt-8">
        <div className="mb-5 flex flex-shrink-0 items-end justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Components
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Versioned workflows your organization has published. Drag them
              from the editor&apos;s palette onto any canvas.
            </p>
          </div>
        </div>

        <div className="relative mb-4 flex-shrink-0">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search components..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="block w-full rounded-md border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none dark:border-app-border dark:bg-app-surface dark:text-white dark:placeholder-gray-400"
          />
        </div>

        <div className="flex-1 overflow-y-auto pb-8">
          <ComponentsList searchQuery={searchQuery} />
        </div>
      </div>
    </div>
  )
}
