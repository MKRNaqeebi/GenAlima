import { Link } from "@tanstack/react-router"
import {
  FiArrowRight,
  FiAward,
  FiDatabase,
  FiEye,
  FiGlobe,
  FiLock,
  FiSearch,
  FiShield,
  FiTrendingUp,
  FiZap,
} from "react-icons/fi"
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
              <a
                href="#features"
                className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                Features
              </a>
              <a
                href="#use-cases"
                className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                Use Cases
              </a>
              <a
                href="#pricing"
                className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                Pricing
              </a>
              <a
                href="#security"
                className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                Security
              </a>
              <Link
                to="/login"
                className="text-gray-700 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
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
      <section className="pt-20 pb-32 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-emerald-50/50 to-white dark:from-emerald-900/10 dark:to-gray-900">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center px-4 py-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-full text-emerald-700 dark:text-emerald-400 font-medium text-sm mb-6">
            🚀 Enterprise AI Search Platform
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            Build Your Enterprise AI Search Agent
            <br />
            <span className="text-emerald-600 dark:text-emerald-400">
              in Minutes, Not Months
            </span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-3xl mx-auto">
            Unify your scattered business knowledge into a single, intelligent
            interface. Connect all your data sources—Gmail, documents,
            databases—and get instant answers powered by advanced AI.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Link
              to="/signup"
              className="px-8 py-4 bg-emerald-600 text-white text-lg font-semibold rounded-lg hover:bg-emerald-700 transition-colors inline-flex items-center justify-center"
            >
              Start Your 14-Day Free Trial
              <FiArrowRight className="ml-2" />
            </Link>
            <a
              href="#demo"
              className="px-8 py-4 bg-white dark:bg-gray-800 border-2 border-emerald-600 text-emerald-600 dark:text-emerald-400 text-lg font-semibold rounded-lg hover:bg-emerald-50 dark:hover:bg-gray-700 transition-colors inline-flex items-center justify-center"
            >
              Watch Demo
              <FiEye className="ml-2" />
            </a>
          </div>
          <p className="text-gray-500 dark:text-gray-400">
            No credit card required • Setup in 5 minutes • Cancel anytime
          </p>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-gray-50 dark:bg-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                85%
              </div>
              <div className="text-gray-600 dark:text-gray-400 mt-1">
                Reduction in Search Time
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                30 Days
              </div>
              <div className="text-gray-600 dark:text-gray-400 mt-1">
                Average ROI Timeline
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                10K+
              </div>
              <div className="text-gray-600 dark:text-gray-400 mt-1">
                Hours Saved Annually
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                100%
              </div>
              <div className="text-gray-600 dark:text-gray-400 mt-1">
                Data Ownership
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem/Solution Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Your Data Challenges, Solved
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              In today's data-driven world, enterprises face critical challenges
              that GenAlima solves
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                The Problems
              </h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="text-red-500 mt-1">✗</div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      Information Silos
                    </h4>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      Critical knowledge scattered across emails, documents,
                      databases, and cloud services
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="text-red-500 mt-1">✗</div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      Search Inefficiency
                    </h4>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      Hours wasted searching for information across multiple
                      platforms
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="text-red-500 mt-1">✗</div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      Knowledge Loss
                    </h4>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      Valuable insights buried in unstructured data
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="text-red-500 mt-1">✗</div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      Decision Delays
                    </h4>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      Slow access to information impacting business decisions
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-6">
                The GenAlima Solution
              </h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="text-emerald-500 mt-1">✓</div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      Unified Search Interface
                    </h4>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      One intelligent interface for all your business data
                      sources
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="text-emerald-500 mt-1">✓</div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      AI-Powered Intelligence
                    </h4>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      Advanced LLMs with semantic search and RAG architecture
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="text-emerald-500 mt-1">✓</div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      Instant Insights
                    </h4>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      Real-time answers with context from all connected sources
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="text-emerald-500 mt-1">✓</div>
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      Enterprise Security
                    </h4>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      Your data stays in your infrastructure with end-to-end
                      encryption
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section
        id="features"
        className="py-20 bg-gray-50 dark:bg-gray-800/50 px-4 sm:px-6 lg:px-8"
      >
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">
            Powerful Features for Enterprise Success
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
                <FiSearch className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Intelligent Search & RAG
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Vector-based semantic search with Retrieval-Augmented Generation
                for accurate, context-aware answers
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                <li>• Semantic search with pgvector</li>
                <li>• Multi-format document support</li>
                <li>• Real-time streaming responses</li>
              </ul>
            </div>
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
                <FiDatabase className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Universal Data Connectors
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Connect all your business data sources with enterprise-grade
                security
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                <li>• Gmail & Google Workspace</li>
                <li>• Azure DevOps & Notion</li>
                <li>• SQL & NoSQL databases</li>
                <li>• Custom API integrations</li>
              </ul>
            </div>
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
                <FiZap className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Advanced AI Capabilities
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Powered by cutting-edge AI with multi-step reasoning
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                <li>• GPT-4, Gemini, Claude support</li>
                <li>• LangGraph agent orchestration</li>
                <li>• Dynamic tool selection</li>
                <li>• Context-aware responses</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section id="use-cases" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">
            Transform Every Department
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="group hover:scale-105 transition-transform">
              <div className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="text-4xl mb-4">💬</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Customer Support Excellence
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Reduce response times by 73% with instant access to product
                  docs, FAQs, and historical tickets
                </p>
              </div>
            </div>
            <div className="group hover:scale-105 transition-transform">
              <div className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="text-4xl mb-4">💼</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Sales Enablement
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Close deals faster with AI-powered access to specs, pricing,
                  and competitive analysis
                </p>
              </div>
            </div>
            <div className="group hover:scale-105 transition-transform">
              <div className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="text-4xl mb-4">👥</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Employee Onboarding
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Accelerate productivity with an AI assistant that knows all
                  company processes and policies
                </p>
              </div>
            </div>
            <div className="group hover:scale-105 transition-transform">
              <div className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="text-4xl mb-4">🔬</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Research & Development
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Search through patents, papers, and internal knowledge to
                  accelerate innovation
                </p>
              </div>
            </div>
            <div className="group hover:scale-105 transition-transform">
              <div className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="text-4xl mb-4">⚖️</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Legal & Compliance
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Ensure compliance with instant access to policies, contracts,
                  and regulations
                </p>
              </div>
            </div>
            <div className="group hover:scale-105 transition-transform">
              <div className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Executive Decisions
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  AI-powered insights from all business systems for data-driven
                  leadership
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Technology Stack */}
      <section className="py-20 bg-gray-50 dark:bg-gray-800/50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">
            Built with Enterprise-Grade Technology
          </h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl mb-2">🔧</div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                Backend
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                FastAPI, PostgreSQL, LangChain, Redis
              </p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">🎨</div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                Frontend
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                React 18, TypeScript, Tailwind CSS
              </p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">🤖</div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                AI/ML
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                OpenAI, Anthropic, Google, pgvector
              </p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2">🚀</div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                DevOps
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Docker, Kubernetes, CI/CD, Monitoring
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Success Stories */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 dark:text-white mb-12">
            Success Stories from Industry Leaders
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center mb-4">
                <FiAward className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mr-2" />
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  Fortune 500 Tech
                </span>
              </div>
              <p className="text-gray-700 dark:text-gray-300 italic mb-4">
                "GenAlima reduced our customer support response time by 73% and
                improved CSAT scores by 28%."
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                — VP of Customer Success
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center mb-4">
                <FiGlobe className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mr-2" />
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  Global Consulting
                </span>
              </div>
              <p className="text-gray-700 dark:text-gray-300 italic mb-4">
                "We've saved over 10,000 hours annually by giving consultants
                instant access to all knowledge assets."
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                — Managing Partner
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center mb-4">
                <FiTrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mr-2" />
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  Legal Firm
                </span>
              </div>
              <p className="text-gray-700 dark:text-gray-300 italic mb-4">
                "GenAlima helps our legal staff quickly access case files while
                maintaining compliance."
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                — Chief Legal Officer
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Trust */}
      <section
        id="security"
        className="py-20 bg-gray-50 dark:bg-gray-800/50 px-4 sm:px-6 lg:px-8"
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Enterprise Security You Can Trust
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
              Your data sovereignty is our priority. GenAlima ensures complete
              control and security.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
                <FiLock className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                End-to-End Encryption
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                All data encrypted at rest and in transit with industry-standard
                protocols
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
                <FiShield className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                100% Data Ownership
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Your data stays in your infrastructure. We never store or train
                on your information
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
                <FiEye className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Compliance Ready
              </h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                SOC 2, GDPR, and HIPAA compliant architecture with audit trails
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <PricingSection />

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-r from-emerald-600 to-emerald-700 dark:from-emerald-700 dark:to-emerald-800 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Transform Your Enterprise Knowledge Today
          </h2>
          <p className="text-xl text-emerald-100 mb-8">
            Join industry leaders who've revolutionized their information access
            with GenAlima. Build your AI search agent in minutes and see ROI in
            30 days.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/signup"
              className="inline-flex items-center px-8 py-4 bg-white text-emerald-600 text-lg font-semibold rounded-lg hover:bg-gray-100 transition-colors"
            >
              Start Your 14-Day Free Trial
              <FiArrowRight className="ml-2" />
            </Link>
            <a
              href="mailto:sales@genalima.com"
              className="inline-flex items-center px-8 py-4 bg-emerald-500 text-white text-lg font-semibold rounded-lg hover:bg-emerald-400 transition-colors"
            >
              Contact Sales
            </a>
          </div>
          <p className="mt-4 text-emerald-100">
            No credit card required • Setup in 5 minutes • White-glove support
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <img src={Logo} alt="GenAlima" className="h-8 w-auto mb-4" />
              <p className="text-sm">Enterprise AI Search Platform</p>
              <p className="text-sm mt-2">Build Your AI Agent in Minutes</p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Product</h3>
              <ul className="space-y-2">
                <li>
                  <a
                    href="#features"
                    className="hover:text-white transition-colors"
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="#use-cases"
                    className="hover:text-white transition-colors"
                  >
                    Use Cases
                  </a>
                </li>
                <li>
                  <a
                    href="#pricing"
                    className="hover:text-white transition-colors"
                  >
                    Pricing
                  </a>
                </li>
                <li>
                  <a
                    href="#security"
                    className="hover:text-white transition-colors"
                  >
                    Security
                  </a>
                </li>
                <li>
                  <a
                    href="/docs"
                    className="hover:text-white transition-colors"
                  >
                    Documentation
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Company</h3>
              <ul className="space-y-2">
                <li>
                  <a
                    href="/about"
                    className="hover:text-white transition-colors"
                  >
                    About Us
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/MKRNaqeebi/GenAlima"
                    className="hover:text-white transition-colors"
                  >
                    GitHub
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:support@genalima.com"
                    className="hover:text-white transition-colors"
                  >
                    Support
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:sales@genalima.com"
                    className="hover:text-white transition-colors"
                  >
                    Contact Sales
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Resources</h3>
              <ul className="space-y-2">
                <li>
                  <a
                    href="/privacy"
                    className="hover:text-white transition-colors"
                  >
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a
                    href="/terms"
                    className="hover:text-white transition-colors"
                  >
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="/api" className="hover:text-white transition-colors">
                    API Docs
                  </a>
                </li>
                <li>
                  <a
                    href="https://discord.gg/genalima"
                    className="hover:text-white transition-colors"
                  >
                    Discord Community
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center">
            <p className="text-sm">
              © 2024 GenAlima, Inc. All rights reserved.
            </p>
            <p className="text-sm mt-2">Built with ❤️ by the GenAlima Team</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default HomePage
