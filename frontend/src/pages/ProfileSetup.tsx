import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, Camera, Send, Plus, X } from 'lucide-react';
import { API_URL } from '../config';

const INTEREST_PRESETS = [
  { label: '💻 Coding', value: 'Coding' },
  { label: '🏃‍♂️ Fitness', value: 'Fitness' },
  { label: '📚 Academics', value: 'Academics' },
  { label: '🎨 Design', value: 'Design' },
  { label: '☕ Coffee Chat', value: 'Coffee' },
  { label: '🎵 Music', value: 'Music' },
  { label: '🎮 Gaming', value: 'Gaming' },
  { label: '⛰️ Outdoors', value: 'Outdoors' }
];

export const ProfileSetup = () => {
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [bio, setBio] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState('');
  const [instagram, setInstagram] = useState('');
  const [telegram, setTelegram] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Get current user initials from localStorage
  const userStr = localStorage.getItem('user');
  const loggedInUser = userStr ? JSON.parse(userStr) : null;
  const userName = loggedInUser?.name || 'User';
  const userInitial = userName.charAt(0).toUpperCase();

  const handleInterestToggle = (val: string) => {
    if (selectedInterests.includes(val)) {
      setSelectedInterests(selectedInterests.filter((i) => i !== val));
    } else {
      setSelectedInterests([...selectedInterests, val]);
    }
  };

  const handleAddCustomInterest = () => {
    const trimmed = customInterest.trim();
    if (!trimmed) return;
    
    // Normalize format
    const formatted = trimmed.length > 20 ? trimmed.substring(0, 20) : trimmed;
    
    if (!selectedInterests.includes(formatted)) {
      setSelectedInterests([...selectedInterests, formatted]);
    }
    setCustomInterest('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('File is too large. Please select an image under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compress using HTML5 canvas
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
          setAvatarUrl(compressedBase64);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const token = localStorage.getItem('token');

    try {
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bio,
          interests: selectedInterests,
          instagram: instagram || null,
          telegram: telegram || null,
          avatarUrl: avatarUrl || null
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile.');
      }

      // Update stored user profile
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Server error. Failed to set up profile.');
    } finally {
      setSubmitting(false);
    }
  };

  const presetValues = INTEREST_PRESETS.map((p) => p.value);
  const customInterests = selectedInterests.filter((i) => !presetValues.includes(i));

  return (
    <div className="auth-split-container">
      {/* Left visual side */}
      <div className="auth-visual-side">
        {/* Overlay thin vector line curves */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.15, zIndex: 1, pointerEvents: 'none' }}>
          <svg width="100%" height="100%" viewBox="0 0 800 800" fill="none">
            <path d="M-100,200 Q300,50 400,600 T900,400" stroke="#ffffff" strokeWidth="2" />
            <path d="M-50,250 Q350,100 450,650 T950,450" stroke="#ffffff" strokeWidth="2" />
            <path d="M0,300 Q400,150 500,700 T1000,500" stroke="#ffffff" strokeWidth="2" />
          </svg>
        </div>

        <div className="auth-visual-inner">
          {/* Geometric 8-pointed White Star Emblem */}
          <svg width="56" height="56" viewBox="0 0 64 64" fill="none" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" style={{ marginBottom: '28px' }}>
            <line x1="32" y1="8" x2="32" y2="56" />
            <line x1="8" y1="32" x2="56" y2="32" />
            <line x1="15.04" y1="15.04" x2="48.96" y2="48.96" />
            <line x1="15.04" y1="48.96" x2="48.96" y2="15.04" />
          </svg>

          <h1 className="auth-visual-title">
            Complete<br />Your Profile! 📍
          </h1>
          <p className="auth-visual-description">
            Complete your professional profile to match with verified developers, fitness enthusiasts, academic peers, and creative minds within your immediate vicinity.
          </p>
        </div>

        <div className="auth-visual-footer">
          © 2026 Dogether. All rights reserved.
        </div>
      </div>

      {/* Right form side */}
      <div className="auth-form-side" style={{ padding: '40px 60px' }}>
        <div className="auth-form-inner" style={{ maxWidth: '480px' }}>
          <div className="auth-brand-header">
            Dogether
          </div>

          <h2 className="auth-welcome-title">
            Complete Your Profile
          </h2>
          <p className="auth-welcome-subtitle" style={{ marginBottom: '28px' }}>
            Complete your profile details to connect with community members.
          </p>

          {error && (
            <div className="alert alert-danger" style={{ marginBottom: '24px' }}>
              <span>⚠️</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Display Picture Upload Section */}
            <div className="auth-form-group" style={{ marginBottom: '28px', alignItems: 'center' }}>
              <label className="auth-label" style={{ alignSelf: 'flex-start' }}>Profile Photo</label>
              
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                <div className="profile-upload-circle-wrapper">
                  <div className="pulse-ring" style={{ borderColor: 'rgba(29, 78, 216, 0.35)' }}></div>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: '120px',
                      height: '120px',
                      borderRadius: '50%',
                      position: 'relative',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      border: '3px solid rgba(29, 78, 216, 0.35)',
                      background: 'rgba(255, 255, 255, 0.02)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: 'var(--shadow)'
                    }}
                    className="profile-upload-circle"
                  >
                    {avatarUrl ? (
                      <img 
                        src={avatarUrl} 
                        alt="Profile Preview" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      />
                    ) : (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(135deg, #1d4ed8 0%, #1e1b4b 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '36px',
                        fontWeight: 700,
                        color: '#ffffff',
                        fontFamily: 'Outfit'
                      }}>
                        {userInitial}
                      </div>
                    )}
                    
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(0, 0, 0, 0.65)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      opacity: 0,
                      transition: 'var(--transition)'
                    }}
                    className="profile-upload-overlay"
                  >
                      <Camera size={20} color="#ffffff" />
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ffffff' }}>Change Photo</span>
                    </div>
                  </div>
                </div>
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                />

                {avatarUrl ? (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl('')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--danger)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      marginTop: '4px'
                    }}
                  >
                    Remove Photo
                  </button>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    Click photo area to upload your image
                  </span>
                )}
              </div>
            </div>

            {/* About You (Bio) */}
            <div className="auth-form-group" style={{ marginBottom: '28px' }}>
              <label className="auth-label" htmlFor="user-bio">About You (Bio)</label>
              <textarea
                id="user-bio"
                className="auth-textarea"
                placeholder="Tell others what you do or what you are up to! (e.g. Coder at cafe, run partner, organic chemistry student...)"
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 200))}
                required
              />
              <div style={{ alignSelf: 'flex-end', fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                {bio.length}/200 characters
              </div>
            </div>

            {/* Interests Tag Grid */}
            <div className="auth-form-group" style={{ marginBottom: '28px' }}>
              <label className="auth-label">Core Interests (Select Hobbies)</label>
              
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%', marginTop: '6px' }}>
                {/* Preset Tag Buttons */}
                {INTEREST_PRESETS.map((interest) => {
                  const isSelected = selectedInterests.includes(interest.value);
                  return (
                    <button
                      key={interest.value}
                      type="button"
                      className={`auth-pill-btn ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleInterestToggle(interest.value)}
                    >
                      {interest.label}
                    </button>
                  );
                })}

                {/* Custom User Added Tag Buttons */}
                {customInterests.map((interest) => (
                  <button
                    key={interest}
                    type="button"
                    className="auth-pill-btn selected"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                    onClick={() => handleInterestToggle(interest)}
                  >
                    🏷️ {interest}
                    <X size={12} style={{ opacity: 0.8 }} />
                  </button>
                ))}
              </div>

              {/* Dynamic Add Custom Interest Control */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px', width: '100%' }}>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="Or type custom interest..."
                  value={customInterest}
                  onChange={(e) => setCustomInterest(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomInterest();
                    }
                  }}
                  style={{ padding: '10px 12px', fontSize: '0.85rem' }}
                />
                <button
                  type="button"
                  onClick={handleAddCustomInterest}
                  className="auth-submit-btn"
                  style={{ padding: '10px 16px', fontSize: '0.85rem', width: 'auto', whiteSpace: 'nowrap' }}
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>

            {/* Social handles */}
            <div className="auth-form-group" style={{ marginBottom: '32px' }}>
              <label className="auth-label">Social Coordinates</label>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '16px', textAlign: 'left', lineHeight: '1.4' }}>
                Add at least one social handle so paired users can verify you safely before meeting.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
                <div className="premium-input-group">
                  <input
                    type="text"
                    className="auth-input"
                    style={{ paddingLeft: '44px' }}
                    placeholder="Instagram username"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                  />
                  <div className="premium-input-icon">
                    <Camera size={18} />
                  </div>
                </div>

                <div className="premium-input-group">
                  <input
                    type="text"
                    className="auth-input"
                    style={{ paddingLeft: '44px' }}
                    placeholder="Telegram handle"
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                  />
                  <div className="premium-input-icon">
                    <Send size={18} />
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={submitting}
              style={{ padding: '14px' }}
            >
              {submitting ? 'Saving settings...' : (
                <>
                  <UserCheck size={18} />
                  Save Profile & Enter Map
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileSetup;
