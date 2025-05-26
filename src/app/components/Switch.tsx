import { useProtectionStore } from '@/lib/store/store';
import './Switch.css';

export function Switch() {
  const { enabled, setEnabled } = useProtectionStore();

  const handleChange = async (checked: boolean) => {
    // Send message to background script
    await chrome.runtime.sendMessage({
      action: 'toggleProtection',
      enabled: checked
    });
    setEnabled(checked);
  };

  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => handleChange(e.target.checked)}
      />
      <span className="slider round"></span>
    </label>
  );
}

