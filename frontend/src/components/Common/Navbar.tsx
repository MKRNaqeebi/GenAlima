import type { ComponentType, ElementType } from "react"
import { useState } from "react"
import { FaPlus } from "react-icons/fa"

interface NavbarProps {
  type: string
  addModalAs: ComponentType | ElementType
}

const Navbar = ({ type, addModalAs }: NavbarProps) => {
  const [isOpen, setIsOpen] = useState(false)

  const AddModal = addModalAs
  return (
    <>
      <div className="flex py-8 gap-4">
        <button
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm md:text-base transition-colors"
          onClick={() => setIsOpen(true)}
        >
          <FaPlus /> Add {type}
        </button>
        <AddModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </div>
    </>
  )
}

export default Navbar
