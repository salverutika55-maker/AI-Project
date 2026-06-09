"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2, AlertTriangle, Settings2, Save } from "lucide-react";

interface PNLStructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  sections: any[];
  onUpdate: () => void;
}

export default function PNLStructureModal({ isOpen, onClose, clientId, sections, onUpdate }: PNLStructureModalProps) {
  const [subheads, setSubheads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [selectedHead, setSelectedHead] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchSubheads();
      const firstHead = (sections || []).find(s => !s.isCalculated);
      if (firstHead) setSelectedHead(firstHead.name);
    }
  }, [isOpen]);

  const fetchSubheads = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/subheads`);
      const data = await res.json();
      setSubheads(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newItemName || !selectedHead) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/subheads`, {
        method: "POST",
        body: JSON.stringify({ name: newItemName, headName: selectedHead })
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to add item");
      } else {
        setNewItemName("");
        await fetchSubheads();
        onUpdate();
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure? This will also remove any mapped Zoho data for this line item.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/subheads?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchSubheads();
        onUpdate();
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleDeleteHead = async (headName: string) => {
    if (!confirm(`Are you sure you want to delete the Head "${headName}"? This will hide it from the P&L structure.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/subheads`, {
        method: "POST",
        body: JSON.stringify({ name: headName, headName: "__DELETED_SECTION__" })
      });
      if (res.ok) {
        await fetchSubheads();
        onUpdate();
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#13131A] w-full max-w-2xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 to-cyan-500/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Settings2 className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tight">Manage P&L Structure</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Customize Line Items for this Company</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white transition-all"><X className="w-6 h-6" /></button>
        </div>

        <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {/* Add New Section */}
          <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-4">
            <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest">Add New Line Item</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select 
                value={selectedHead} 
                onChange={(e) => setSelectedHead(e.target.value)}
                className="bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                {(sections || []).filter(s => s && !s.isCalculated && !subheads.some(c => c.headName === "__DELETED_SECTION__" && c.name === s.name)).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              <div className="relative">
                <input 
                  type="text" 
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="e.g. Travelling Expenses"
                  className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <button 
                  onClick={handleAdd}
                  disabled={loading || !newItemName}
                  className="absolute right-2 top-2 p-1.5 bg-emerald-500 text-slate-950 rounded-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* List Sections */}
          <div className="space-y-6">
            {(sections || []).filter(s => s && !s.isCalculated && !subheads.some(c => c.headName === "__DELETED_SECTION__" && c.name === s.name)).map(section => {
              const items = (subheads || []).filter(sh => sh && sh.headName === section.name);
              return (
                <div key={section.name} className="space-y-3">
                  <div className="flex items-center justify-between mb-2 group">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{section.name}</h4>
                    <button 
                      onClick={() => handleDeleteHead(section.name)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-600 hover:text-rose-500 transition-all"
                      title="Delete Head"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {items.map(item => (
                      <div key={item.id} className="group flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-all">
                        <span className="text-xs font-bold text-slate-300">{item.name}</span>
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-600 hover:text-rose-500 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {items.length === 0 && <p className="text-[10px] text-slate-600 italic">No custom items defined</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-8 bg-black/20 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-500/80">
            <AlertTriangle className="w-4 h-4" />
            <p className="text-[10px] font-black uppercase tracking-widest">Changes only affect this company</p>
          </div>
          <button onClick={onClose} className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all">Done</button>
        </div>
      </div>
    </div>
  );
}
