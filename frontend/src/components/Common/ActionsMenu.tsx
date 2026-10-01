import { useState, useRef, useEffect } from "react"
import { BsThreeDotsVertical } from "react-icons/bs"
import { FiEdit, FiTrash } from "react-icons/fi"

import type { UserPublic } from "../../client"
import EditUser from "../Admin/EditUser"
import Delete from "./DeleteAlert"

interface ActionsMenuProps {
  type: string
  value: UserPublic
  disabled?: boolean
}

const ActionsMenu = ({ type, value, disabled }: ActionsMenuProps) => {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Actions menu"
      >
        <BsThreeDotsVertical className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      </button>

      {isMenuOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
          <button
            type="button"
            onClick={() => {
              setIsEditOpen(true)
              setIsMenuOpen(false)
            }}
            className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 first:rounded-t-lg"
          >
            <FiEdit className="w-4 h-4" />
            Edit {type}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsDeleteOpen(true)
              setIsMenuOpen(false)
            }}
            className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-red-600 dark:text-red-400 last:rounded-b-lg"
          >
            <FiTrash className="w-4 h-4" />
            Delete {type}
          </button>
        </div>
      )}

      <EditUser
        user={value}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
      />

      <Delete
        type={type}
        id={value.id}
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
      />
    </div>
  )
}

export default ActionsMenu
