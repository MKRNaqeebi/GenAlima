import { Link } from "@tanstack/react-router"
import { FaUserAstronaut } from "react-icons/fa"
import { FiLogOut, FiUser } from "react-icons/fi"
import { useState, useEffect, useRef } from "react"

import useAuth from "../../hooks/useAuth"

const UserMenu = () => {
  const { logout } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleLogout = async () => {
    logout()
  }

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="hidden md:block fixed top-4 right-4" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 bg-emerald-600 hover:bg-emerald-700 rounded-full flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        aria-label="Options"
        data-testid="user-menu"
      >
        <FaUserAstronaut className="text-white text-lg" />
      </button>
      
      {isOpen && (
        <div className="absolute right-0 top-12 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50">
          <Link
            to="/settings"
            className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setIsOpen(false)}
          >
            <FiUser className="text-lg" />
            <span>My profile</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-bold"
          >
            <FiLogOut className="text-lg" />
            <span>Log out</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default UserMenu
