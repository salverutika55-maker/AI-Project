import React from 'react';
import { ArrowRightLeft } from 'lucide-react';

export default function TradingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-20 h-20 bg-cyan-500/10 border border-cyan-500/20 rounded-full flex items-center justify-center mb-6">
        <ArrowRightLeft className="w-10 h-10 text-cyan-400" />
      </div>
      <h1 className="text-3xl font-bold text-white mb-4">Trading P&L</h1>
      <p className="text-slate-400 max-w-lg mx-auto">
        This section will contain the specialized Profit & Loss formats and analytics specifically tailored for the Trading sector. It is currently under development.
      </p>
    </div>
  );
}
