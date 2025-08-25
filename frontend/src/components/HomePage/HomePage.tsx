import { Link } from "@tanstack/react-router"
import { FiClock, FiTarget, FiUsers, FiLock, FiShield, FiEye, FiArrowRight } from "react-icons/fi"
import Logo from "/assets/images/genalima-logo.png"
import PricingSection from "./PricingSection"

const HomePage = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <img src={Logo} alt="GenAlima" className="h-8 w-auto" />
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Features
              </a>
              <a href="#pricing" className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Pricing
              </a>
              <a href="#security" className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Security
              </a>
              <Link to="/login" className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Login
              </Link>
              <Link 
                to="/signup" 
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-20 pb-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            Ask Questions. Get Answers.
            <br />
            <span className="text-emerald-600 dark:text-emerald-400">From All Your Business Data.</span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-3xl mx-auto">
            Stop hunting through Google Drive, emails, and documents. Our AI agent connects to all your data sources, 
            finding the exact information you need in seconds.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              to="/signup" 
              className="px-8 py-4 bg-emerald-600 text-white text-lg font-semibold rounded-lg hover:bg-emerald-700 transition-colors inline-flex items-center justify-center"
            >
              Start Your 14-Day Free Trial
              <FiArrowRight className="ml-2" />
            </Link>
          </div>
          <p className="mt-4 text-gray-500 dark:text-gray-400">No credit card required</p>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-12 bg-gray-50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Trusted by innovative small and medium businesses worldwide
          </p>
          <div className="flex justify-center items-center space-x-12 opacity-60">
            {/* Placeholder for company logos */}
            <div className="text-gray-400">InnovateCorp</div>
            <div className="text-gray-400">MarketBoost</div>
            <div className="text-gray-400">Solutions Inc.</div>
            <div className="text-gray-400">Growth Partners</div>
          </div>
        </div>
      </section>

      {/* Problem/Pain Point Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Stop Searching. Start Knowing.
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              Your company's most valuable asset is its knowledge, but it's trapped. 
              Scattered across different apps and inboxes, finding one piece of information can feel impossible.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 mt-12">
            <div className="flex items-start space-x-4">
              <div className="text-red-500 mt-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Time Wasted</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Wasting hours every week hunting for files and conversations
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="text-red-500 mt-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Poor Decisions</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Making critical decisions based on incomplete or outdated information
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="text-red-500 mt-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Slow Onboarding</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Onboarding new team members takes forever because knowledge is siloed
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-gray-50 dark:bg-gray-800/50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">
            Your Data, Unified and Intelligent, in 3 Simple Steps
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">1</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Connect Your Sources
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Securely link your apps like Google Drive, Slack, Notion, Outlook, and more in just a few clicks. 
                Our system is built with enterprise-grade security.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">2</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Ask Anything
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Use simple, natural language to ask questions. No complex queries needed. 
                For example: "What were our Q2 sales figures for the 'Alpha' project?"
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">3</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Get Instant Answers
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Our AI agent instantly synthesizes information from all connected sources to give you a direct answer, 
                complete with links to the original documents.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features as Benefits */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">
            More Than Search. It's Your Business Superpower.
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
                <FiClock className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Reclaim Your Time
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Slash the time your team spends searching for information by up to 80%. 
                Focus on high-value work, not digital scavenger hunts.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
                <FiTarget className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Make Smarter Decisions
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Get a complete picture by drawing insights from every corner of your business. 
                Uncover trends, track project progress, and act on data, not guesswork.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
                <FiUsers className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Unify Your Team's Knowledge
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Create a single source of truth for your entire organization. 
                Ensure everyone is working with the most current, accurate information, instantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-20 bg-gray-50 dark:bg-gray-800/50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
            Why Business Owners Choose Us
          </h2>
          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
            <p className="text-xl text-gray-700 dark:text-gray-300 italic mb-6">
              "This tool is a game-changer. I used to spend hours digging through emails and Drive for client info before meetings. 
              Now, I just ask a question and get a full summary in 30 seconds. We're more prepared and our clients have noticed."
            </p>
            <div className="flex items-center justify-center">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Jane Doe</p>
                <p className="text-gray-600 dark:text-gray-400">CEO of a Marketing Agency</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Trust */}
      <section id="security" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Your Data is Yours. Period.
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              We understand your data is sensitive. Security isn't an afterthought; it's our foundation.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <FiLock className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  End-to-End Encryption
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Your data is encrypted at rest and in transit
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <FiEye className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Read-Only Access
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  We never modify your original files
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <FiShield className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Strict Privacy
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Your data is never used to train third-party AI models
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <PricingSection />

      {/* Final CTA */}
      <section className="py-20 bg-emerald-600 dark:bg-emerald-700 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to Unlock the Power of Your Data?
          </h2>
          <p className="text-xl text-emerald-100 mb-8">
            Stop letting valuable knowledge hide in plain sight. Find what you need, when you need it, 
            and empower your team to do their best work.
          </p>
          <Link 
            to="/signup" 
            className="inline-flex items-center px-8 py-4 bg-white text-emerald-600 text-lg font-semibold rounded-lg hover:bg-gray-100 transition-colors"
          >
            Start Your 14-Day Free Trial
            <FiArrowRight className="ml-2" />
          </Link>
          <p className="mt-4 text-emerald-100">Free for 14 days. Cancel anytime.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <img src={Logo} alt="GenAlima" className="h-8 w-auto mb-4" />
              <p className="text-sm">
                Your one-stop AI assistant for all business data insights.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Product</h3>
              <ul className="space-y-2">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#security" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Company</h3>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Legal</h3>
              <ul className="space-y-2">
                <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center">
            <p className="text-sm">&copy; 2024 GenAlima. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default HomePage