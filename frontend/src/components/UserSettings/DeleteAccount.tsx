import { useState } from "react"
import DeleteConfirmation from "./DeleteConfirmation"

const DeleteAccount = () => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="max-w-full mx-auto">
      <h2 className="text-sm font-medium py-4">
        Delete Account
      </h2>
      <p className="text-gray-700 mb-4">
        Permanently delete your data and everything associated with your
        account.
      </p>
      <button
        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        onClick={() => setIsOpen(true)}
      >
        Delete
      </button>
      <DeleteConfirmation
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </div>
  )
}
export default DeleteAccount
