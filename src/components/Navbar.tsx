import { Menu, X } from 'lucide-react';
import logo from '../assets/logo.png';
import { motion } from 'framer-motion';
import { useState } from 'react';

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
      <div className="max-w-7xl mx-auto glass rounded-2xl px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={logo} alt="LoadPulse" className="w-8 h-8 object-contain" />
          <span className="text-xl font-bold tracking-tight text-white">LoadPulse</span>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {['Features', 'Solutions', 'Pricing', 'Docs'].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              {item}
            </a>
          ))}
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-900/20 active:scale-95">
            Get Started
          </button>
        </div>

        {/* Mobile Toggle */}
        <button 
          className="md:hidden text-slate-300"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden mt-4 glass rounded-2xl p-6 flex flex-col gap-4"
        >
          {['Features', 'Solutions', 'Pricing', 'Docs'].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-lg font-medium text-slate-300"
              onClick={() => setIsOpen(false)}
            >
              {item}
            </a>
          ))}
          <button className="bg-blue-600 text-white px-5 py-3 rounded-xl text-center font-semibold">
            Get Started
          </button>
        </motion.div>
      )}
    </nav>
  );
};
