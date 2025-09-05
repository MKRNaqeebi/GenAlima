import React, { useState, useRef } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FiUpload, FiX, FiFile, FiCheck, FiAlertCircle } from "react-icons/fi"
import { KnowledgeFilesService } from "../../client"

interface AddKnowledgeProps {
  isOpen: boolean
  onClose: () => void
}

const AddKnowledge = ({ isOpen, onClose }: AddKnowledgeProps) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => {
      return KnowledgeFilesService.createKnowledgeFiles({
        requestBody: { files }
      })
    },
    onSuccess: () => {
      // Refresh the knowledge files list
      queryClient.invalidateQueries({ queryKey: ["knowledgeFiles"] })
      // Reset form and close
      setSelectedFiles([])
      onClose()
    },
    onError: (error) => {
      console.error("Upload error:", error)
    }
  })

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return
    
    const pdfFiles = Array.from(files).filter(file => 
      file.type === "application/pdf"
    )
    
    if (pdfFiles.length !== files.length) {
      alert("Only PDF files are allowed")
    }
    
    setSelectedFiles(pdfFiles)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedFiles.length > 0) {
      uploadMutation.mutate(selectedFiles)
    }
  }

  const handleClose = () => {
    if (!uploadMutation.isPending) {
      setSelectedFiles([])
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
            <FiUpload className="w-6 h-6 text-blue-600" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Upload Knowledge Files
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={uploadMutation.isPending}
            title="Close dialog"
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Upload Area */}
          <div
            className={`relative border-2 border-dashed rounded-lg p-8 transition-colors ${
              isDragOver
                ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="text-center">
              <FiUpload className="mx-auto w-12 h-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Drop PDF files here, or{" "}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-blue-600 hover:text-blue-700 underline"
                >
                  browse
                </button>
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Only PDF files are supported
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={(e) => handleFileSelect(e.target.files)}
              aria-label="Upload PDF files"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          {/* Selected Files */}
          {selectedFiles.length > 0 && (
            <div className="mt-6">
              <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Selected Files ({selectedFiles.length})
              </h4>
              <div className="space-y-3 max-h-40 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <FiFile className="w-5 h-5 text-red-600 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      disabled={uploadMutation.isPending}
                      title={`Remove ${file.name}`}
                      className="p-1 text-gray-500 hover:text-red-600 disabled:opacity-50"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Message */}
          {uploadMutation.error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center space-x-2">
                <FiAlertCircle className="w-5 h-5 text-red-600" />
                <p className="text-sm text-red-600 dark:text-red-400">
                  Upload failed: {uploadMutation.error.message}
                </p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {uploadMutation.isSuccess && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center space-x-2">
                <FiCheck className="w-5 h-5 text-green-600" />
                <p className="text-sm text-green-600 dark:text-green-400">
                  Files uploaded successfully!
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-4 mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleClose}
              disabled={uploadMutation.isPending}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-transparent border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={selectedFiles.length === 0 || uploadMutation.isPending}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-colors"
            >
              {uploadMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <FiUpload className="w-4 h-4" />
                  <span>Upload Files</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddKnowledge
