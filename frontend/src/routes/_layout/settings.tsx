import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  FiUser,
  FiLock,
  FiMoon,
  FiSun,
} from "react-icons/fi"
import UserInformation from "../../components/UserSettings/UserInformation"
import ChangePassword from "../../components/UserSettings/ChangePassword"
import { useTheme } from "../../contexts/ThemeContext"

export const Route = createFileRoute("/_layout/settings")({
  component: UserSettings,
})

function UserSettings() {
  const [activeTab, setActiveTab] = useState("profile")
  const { isDark, toggleTheme } = useTheme()

  const tabs = [
    { id: "profile", title: "Profile", icon: FiUser },
    { id: "password", title: "Password", icon: FiLock },
    { id: "appearance", title: "Appearance", icon: isDark ? FiMoon : FiSun },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-chat-bg transition-colors">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Settings</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage your account settings and preferences</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? "bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800/50"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span>{tab.title}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Content Area */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-[#2f2f2f] rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              {activeTab === "profile" && (
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Profile Information</h2>
                  <UserInformation />
                </div>
              )}

              {activeTab === "password" && (
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Change Password</h2>
                  <ChangePassword />
                </div>
              )}

              {activeTab === "appearance" && (
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Appearance</h2>
                  
                  <div className="space-y-6">
                    {/* Dark Mode Toggle */}
                    <div className="flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                      <div>
                        <h3 className="text-gray-900 dark:text-white font-medium">Theme</h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                          Toggle between light and dark theme
                        </p>
                      </div>
                      <button
                        onClick={toggleTheme}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          isDark ? "bg-blue-600" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            isDark ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Theme Preview */}
                    <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                      <h3 className="text-gray-900 dark:text-white font-medium mb-3">Theme Preview</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div 
                          className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                            !isDark ? "border-blue-500 bg-white" : "border-gray-300 bg-white"
                          }`}
                          onClick={() => !isDark || toggleTheme()}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <FiSun className="w-4 h-4 text-yellow-500" />
                            <span className="text-gray-900 text-sm font-medium">Light</span>
                          </div>
                          <div className="space-y-2">
                            <div className="h-2 bg-gray-300 rounded"></div>
                            <div className="h-2 bg-gray-300 rounded w-3/4"></div>
                          </div>
                        </div>
                        
                        <div 
                          className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                            isDark ? "border-blue-500 bg-gray-900" : "border-gray-600 bg-gray-900"
                          }`}
                          onClick={() => isDark || toggleTheme()}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <FiMoon className="w-4 h-4 text-blue-400" />
                            <span className="text-white text-sm font-medium">Dark</span>
                          </div>
                          <div className="space-y-2">
                            <div className="h-2 bg-gray-700 rounded"></div>
                            <div className="h-2 bg-gray-700 rounded w-3/4"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}