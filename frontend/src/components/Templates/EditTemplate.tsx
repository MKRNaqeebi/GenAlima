import React, { useState, useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FiEdit, FiX, FiCheck, FiAlertCircle, FiChevronDown } from "react-icons/fi"
import { TemplatesService, ConnectorsService } from "../../client"
import type { TemplatePublic } from "../../client"

interface EditTemplateProps {
  isOpen: boolean
  onClose: () => void
  template: TemplatePublic | null
}

const EditTemplate = ({ isOpen, onClose, template }: EditTemplateProps) => {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    template: "",
    placeholder: "",
    model: "",
    connector: [] as string[],
    active: true
  })
  const [showConnectorDropdown, setShowConnectorDropdown] = useState(false)

  const queryClient = useQueryClient()

  // Fetch connectors
  const { data: connectorsData } = useQuery({
    queryKey: ["connectors", "all"],
    queryFn: () => ConnectorsService.readConnectors({ limit: 100 }),
    enabled: isOpen
  })

  // Initialize form data when template changes
  useEffect(() => {
    if (template) {
      setFormData({
        title: template.title || "",
        description: template.description || "",
        template: template.template || "",
        placeholder: template.placeholder || "",
        model: template.model || "",
        connector: template.connector ? template.connector.split(",").filter(Boolean) : [],
        active: template.active !== undefined ? template.active : true
      })
    }
  }, [template])

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData) => {
      if (!template?.id) throw new Error("Template ID is required")
      return TemplatesService.updateTemplate({
        id: template.id,
        requestBody: {
          title: data.title,
          description: data.description || null,
          template: data.template || null,
          placeholder: data.placeholder || null,
          model: data.model || null,
          connector: data.connector.length > 0 ? data.connector.join(",") : null,
          active: data.active
        }
      })
    },
    onSuccess: () => {
      // Refresh the templates list
      queryClient.invalidateQueries({ queryKey: ["templates"] })
      onClose()
    },
    onError: (error) => {
      console.error("Update template error:", error)
    }
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked
      setFormData(prev => ({ ...prev, [name]: checked }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const toggleConnector = (connectorId: string) => {
    setFormData(prev => ({
      ...prev,
      connector: prev.connector.includes(connectorId)
        ? prev.connector.filter(id => id !== connectorId)
        : [...prev.connector, connectorId]
    }))
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.connector-dropdown')) {
        setShowConnectorDropdown(false)
      }
    }

    if (showConnectorDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showConnectorDropdown])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.title.trim()) {
      updateMutation.mutate(formData)
    }
  }

  const handleClose = () => {
    if (!updateMutation.isPending) {
      onClose()
    }
  }

  if (!isOpen || !template) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={handleClose}></div>
      <div className="relative bg-white dark:bg-[#2f2f2f] rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <FiEdit className="w-6 h-6 text-blue-600" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Edit Template
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={updateMutation.isPending}
            title="Close dialog"
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Title Field */}
          <div className="mb-6">
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Title *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              required
              placeholder="Enter template title..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>

          {/* Description Field */}
          <div className="mb-6">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={3}
              placeholder="Enter template description..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-vertical"
            />
          </div>

          {/* Template Content Field */}
          <div className="mb-6">
            <label htmlFor="template" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Template Content
            </label>
            <textarea
              id="template"
              name="template"
              value={formData.template}
              onChange={handleInputChange}
              rows={8}
              placeholder="Enter your template content here... You can use variables like {{variable_name}} for dynamic content."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-vertical font-mono text-sm"
            />
          </div>

          {/* Placeholder Field */}
          <div className="mb-6">
            <label htmlFor="placeholder" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Placeholder Text
            </label>
            <input
              type="text"
              id="placeholder"
              name="placeholder"
              value={formData.placeholder}
              onChange={handleInputChange}
              placeholder="Enter placeholder text for inputs..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>

          {/* Model Field */}
          <div className="mb-6">
            <label htmlFor="model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              AI Model
            </label>
            <input
              type="text"
              id="model"
              name="model"
              value={formData.model}
              onChange={handleInputChange}
              placeholder="e.g., gpt-4, claude-3-sonnet..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>

          {/* Connector Field - Multi-select Dropdown */}
          <div className="mb-6 relative connector-dropdown">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Connectors
            </label>
            <div
              onClick={() => setShowConnectorDropdown(!showConnectorDropdown)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-white cursor-pointer flex items-center justify-between"
            >
              <span className="text-gray-900 dark:text-white">
                {formData.connector.length > 0
                  ? `${formData.connector.length} connector(s) selected`
                  : "Select connectors..."}
              </span>
              <FiChevronDown className={`w-4 h-4 transition-transform ${showConnectorDropdown ? 'rotate-180' : ''}`} />
            </div>
            
            {showConnectorDropdown && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                {connectorsData?.data && connectorsData.data.length > 0 ? (
                  connectorsData.data.map((connector) => (
                    <div
                      key={connector.id}
                      onClick={() => toggleConnector(connector.id)}
                      className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center space-x-2"
                    >
                      <input
                        type="checkbox"
                        checked={formData.connector.includes(connector.id)}
                        onChange={() => {}}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        aria-label={`Select ${connector.name || connector.id}`}
                      />
                      <span className="text-sm text-gray-900 dark:text-white">
                        {connector.name || `Connector ${connector.id}`}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                    No connectors available
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Active Field */}
          <div className="mb-6">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="active"
                name="active"
                checked={formData.active}
                onChange={handleInputChange}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="active" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Active Template
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Active templates can be used in chat conversations
            </p>
          </div>

          {/* Error Message */}
          {updateMutation.error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center space-x-2">
                <FiAlertCircle className="w-5 h-5 text-red-600" />
                <p className="text-sm text-red-600 dark:text-red-400">
                  Failed to update template: {updateMutation.error.message}
                </p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {updateMutation.isSuccess && (
            <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center space-x-2">
                <FiCheck className="w-5 h-5 text-green-600" />
                <p className="text-sm text-green-600 dark:text-green-400">
                  Template updated successfully!
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleClose}
              disabled={updateMutation.isPending}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-transparent border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!formData.title.trim() || updateMutation.isPending}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-colors"
            >
              {updateMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <FiEdit className="w-4 h-4" />
                  <span>Update Template</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditTemplate