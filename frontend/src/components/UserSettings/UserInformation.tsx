import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FiUser, FiMail, FiSave } from "react-icons/fi"

import { UsersService } from "../../client"
import type { UserPublic, UserUpdateMe } from "../../client"
import useCustomToast from "../../hooks/useCustomToast"

const UserInformation = () => {
  const queryClient = useQueryClient()
  const showToast = useCustomToast()
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])
  
  const [formData, setFormData] = useState({
    email: currentUser?.email || "",
    full_name: currentUser?.full_name || "",
  })

  const mutation = useMutation({
    mutationFn: (data: UserUpdateMe) =>
      UsersService.updateUserMe({ requestBody: data }),
    onSuccess: () => {
      showToast("Success!", "Profile updated successfully.", "success")
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    },
    onError: () => {
      showToast(
        "Error",
        "Failed to update profile. Please try again.",
        "error"
      )
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Email Field */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          <div className="flex items-center gap-2">
            <FiMail className="w-4 h-4" />
            Email Address
          </div>
        </label>
        <input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          className="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          placeholder="Enter your email"
          required
        />
      </div>

      {/* Full Name Field */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          <div className="flex items-center gap-2">
            <FiUser className="w-4 h-4" />
            Full Name
          </div>
        </label>
        <input
          type="text"
          name="full_name"
          value={formData.full_name}
          onChange={handleChange}
          className="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          placeholder="Enter your full name"
        />
      </div>

      {/* Account Info */}
      <div className="p-4 bg-gray-800 rounded-lg">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Account Information</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Account Type:</span>
            <span className="text-white">
              {currentUser?.is_superuser ? "Admin" : "User"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Status:</span>
            <span className="text-green-400">
              {currentUser?.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <FiSave className="w-4 h-4" />
          {mutation.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  )
}

export default UserInformation