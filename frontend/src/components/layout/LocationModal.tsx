import React from 'react';
import { Modal } from '../common/Modal';
import { useAppStore } from '../../stores/useAppStore';
import { MOCK_LOCATIONS } from '../../services/mockData';
import { MapPin, Check } from 'lucide-react';
import clsx from 'clsx';

export const LocationModal: React.FC = () => {
  const { isLocationModalOpen, setLocationModalOpen, currentLocationId, setCurrentLocationId } = useAppStore();

  const handleSelect = (id: string) => {
    setCurrentLocationId(id);
    setLocationModalOpen(false);
  };

  return (
    <Modal
      isOpen={isLocationModalOpen}
      onClose={() => setLocationModalOpen(false)}
      title="Select Air Quality Station"
      maxWidth="md"
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Official real-time monitoring stations and hyper-local urban nodes:
        </p>
        
        <div className="space-y-2">
          {MOCK_LOCATIONS.map((loc) => {
            const isSelected = loc.id === currentLocationId;
            return (
              <button
                key={loc.id}
                onClick={() => handleSelect(loc.id)}
                className={clsx(
                  'w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all',
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100 font-semibold'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'p-2 rounded-lg',
                    isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  )}>
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{loc.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{loc.city} • Official CPCB Node</p>
                  </div>
                </div>

                {isSelected && (
                  <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                )}
              </button>
            );
          })}
        </div>

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <span>* India CPCB data updates hourly. Distance measured from city centroid.</span>
        </div>
      </div>
    </Modal>
  );
};
