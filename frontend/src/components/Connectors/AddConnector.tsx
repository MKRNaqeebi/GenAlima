// TODO: Convert this component from Chakra UI to Tailwind CSS
interface AddConnectorProps {
  isOpen: boolean
  onClose: () => void
}

const AddConnector = ({ isOpen, onClose }: AddConnectorProps) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="relative bg-white rounded-lg shadow-lg max-w-md mx-4 w-full p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">AddConnector</h3>
        <p className="text-gray-600 mb-4">This component needs to be converted from Chakra UI to Tailwind CSS.</p>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Close
        </button>
      </div>
    </div>
  )
}

export default AddConnector
