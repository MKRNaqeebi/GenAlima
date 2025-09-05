import React, { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FiPlus, FiX, FiCheck, FiAlertCircle } from "react-icons/fi"
import { TemplatesService } from "../../client"

interface AddTemplateProps {
  isOpen: boolean
  onClose: () => void
}

const AddTemplate = ({ isOpen, onClose }: AddTemplateProps) => {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    template: "",
    placeholder: "",
    model: ""
  })

  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => {
      return TemplatesService.createTemplate({
        requestBody: {
          title: data.title,
          description: data.description || null,
          template: data.template || null,
          placeholder: data.placeholder || null,
          model: data.model || null
        }
      })
    },
    onSuccess: () => {
      // Refresh the templates list
      queryClient.invalidateQueries({ queryKey: ["templates"] })
      // Reset form and close
      setFormData({
        title: "",
        description: "",
        template: "",
        placeholder: "",
        model: ""
      })
      onClose()
    },
    onError: (error) => {
      console.error("Create template error:", error)
    }
  })

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.title.trim()) {
      createMutation.mutate(formData)
    }
  }

  const handleClose = () => {
    if (!createMutation.isPending) {
      setFormData({
        title: "",
        description: "",
        template: "",
        placeholder: "",
        model: ""
      })
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={handleClose}></div>
      <div className="relative bg-white dark:bg-[#2f2f2f] rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <FiPlus className="w-6 h-6 text-blue-600" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Create New Template
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={createMutation.isPending}
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

          {/* Error Message */}
          {createMutation.error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center space-x-2">
                <FiAlertCircle className="w-5 h-5 text-red-600" />
                <p className="text-sm text-red-600 dark:text-red-400">
                  Failed to create template: {createMutation.error.message}
                </p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {createMutation.isSuccess && (
            <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center space-x-2">
                <FiCheck className="w-5 h-5 text-green-600" />
                <p className="text-sm text-green-600 dark:text-green-400">
                  Template created successfully!
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleClose}
              disabled={createMutation.isPending}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-transparent border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!formData.title.trim() || createMutation.isPending}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-colors"
            >
              {createMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <FiPlus className="w-4 h-4" />
                  <span>Create Template</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddTemplate
