import { Link } from "@tanstack/react-router"

const NotFound = () => {
  return (
    <div className="min-h-screen max-w-sm mx-auto flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-8xl font-bold text-emerald-600 dark:text-emerald-400 leading-none mb-4">
        404
      </h1>
      <p className="text-lg text-gray-700 dark:text-gray-300 mb-2">Oops!</p>
      <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">Page not found.</p>
      <Link
        to="/"
        className="px-6 py-2 border-2 border-emerald-600 dark:border-emerald-400 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
      >
        Go back
      </Link>
    </div>
  )
}

export default NotFound
