import { useState, useRef, useEffect } from "react"
import { BsThreeDotsVertical } from "react-icons/bs"
import { FiEdit, FiTrash } from "react-icons/fi"

import type { ItemPublic, UserPublic, TemplatePublic, ConnectorPublic, ChatPublic, MessagePublic, KnowledgePublic } from "../../client"
import EditUser from "../Admin/EditUser"
import EditItem from "../Items/EditItem"
import EditTemplate from "../Templates/EditTemplate"
import EditChat from "../Chats/EditChat"
import EditMessage from "../Messages/EditMessage"
import EditConnector from "../Connectors/EditConnector"
import EditKnowledge from "../Knowledges/EditKnowledge"
import Delete from "./DeleteAlert"

interface ActionsMenuProps {
  type: string
  value: ItemPublic | UserPublic | TemplatePublic | ConnectorPublic | ChatPublic | MessagePublic | KnowledgePublic
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
      
      {type === "User" ? (
        <EditUser
          user={value as UserPublic}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
        />
      ) : type === "Connector" ? (
        <EditConnector
          connector={value as ConnectorPublic}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
        />
      ) : type === "Chat" ? (
        <EditChat
          chat={value as ChatPublic}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
        />
      ) : type === "Message" ? (
        <EditMessage
          message={value as MessagePublic}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
        />
      ) : type === "Knowledge" ? (
        <EditKnowledge
          knowledge={value as KnowledgePublic}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
        />
      ) : type === "Template" ? (
        <EditTemplate
          template={value as TemplatePublic}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
        />
      ) : (
        <EditItem
          item={value as ItemPublic}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
        />
      )}
      
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
