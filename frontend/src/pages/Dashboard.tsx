import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../config';
import L from 'leaflet';
import { LogOut, Plus, MapPin, Compass, Award, ShieldAlert, Edit2, MessageSquare, CreditCard, X, Send, Camera, Image } from 'lucide-react';

interface Message {
  id: string;
  sessionId: string;
  senderId: string;
  content: string;
  imageUrl?: string | null;
  createdAt: string;
}

interface Session {
  id: string;
  taskId: string;
  clientId: string;
  helperId: string;
  status: string;
  paymentStatus: string;
  updatedAt: string;
  task: {
    title: string;
    description: string;
    price: number;
    isPaid: boolean;
  };
  client: {
    id: string;
    name: string;
    avatarUrl: string | null;
    rating: number;
    bio: string | null;
    interests: string[];
    instagram: string | null;
    telegram: string | null;
  };
  helper: {
    id: string;
    name: string;
    avatarUrl: string | null;
    rating: number;
    bio: string | null;
    interests: string[];
    instagram: string | null;
    telegram: string | null;
  };
  messages?: Message[];
}

interface Task {
  id: string;
  title: string;
  description: string;
  price: number;
  isPaid: boolean;
  status: string;
  latitude: number;
  longitude: number;
  distance?: number;
  creatorId: string;
  // Creator Joined Profile Fields
  creatorName: string;
  creatorAvatar: string | null;
  creatorRating: number;
  creatorBio: string | null;
  creatorInterests: string[];
  creatorInstagram: string | null;
  creatorTelegram: string | null;
}

export const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0');
  const [isPaid, setIsPaid] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Chat & Payment states
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [activeSessionMessages, setActiveSessionMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentCardNumber, setPaymentCardNumber] = useState('');
  const [paymentCardName, setPaymentCardName] = useState('');
  const [paymentCardExpiry, setPaymentCardExpiry] = useState('');
  const [paymentCardCvv, setPaymentCardCvv] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'gpay' | 'phonepe' | 'cod'>('card');
  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoSuccess, setPromoSuccess] = useState<string | null>(null);
  const [phonePeUpiId, setPhonePeUpiId] = useState('');
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'tasks' | 'chats'>('tasks');
  const [paymentStep, setPaymentStep] = useState<'idle' | 'redirecting' | 'authorizing' | 'success'>('idle');

  // Image Upload / Camera states
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  
  // Custom states
  const [nearbyUsers, setNearbyUsers] = useState<any[]>([]);
  const [activeRedirectGateway, setActiveRedirectGateway] = useState<'gpay' | 'phonepe' | null>(null);
  const [gatewayStep, setGatewayStep] = useState<'idle' | 'pin' | 'authorizing' | 'success' | 'cancelled'>('idle');
  const [gatewayPin, setGatewayPin] = useState<string>('');
  const [showCompletedChats, setShowCompletedChats] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [activeNotification, setActiveNotification] = useState<{ senderName: string; content: string; sessionId: string } | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markerGroup = useRef<L.LayerGroup | null>(null);
  const userMarker = useRef<L.Marker | null>(null);
  const userMarkersGroup = useRef<L.LayerGroup | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const heartbeatIntervalRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeSessionRef = useRef<any>(null);
  const sessionsRef = useRef<any[]>([]);
  const navigate = useNavigate();

  // Keep refs in sync to avoid stale closures in socket events
  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Automatically clear active notification after 4 seconds
  useEffect(() => {
    if (activeNotification) {
      const timer = setTimeout(() => {
        setActiveNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [activeNotification]);

  // 1. Initial Authentication & GPS setup
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (!storedToken || !storedUser) {
      navigate('/login');
      return;
    }

    const userData = JSON.parse(storedUser);
    setUser(userData);
    fetchUserSessions();

    // Fetch user coordinates using Geolocation API
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude: lat, longitude: lng } = position.coords;
          setLatitude(lat);
          setLongitude(lng);
          initializeMap(lat, lng);
          initializeSockets(userData.id, lat, lng);
          fetchNearbyTasks(lat, lng);
        },
        (err) => {
          console.warn('Geolocation failed. Using Bangalore defaults.', err);
          const defaultLat = 12.9716;
          const defaultLng = 77.5946;
          setLatitude(defaultLat);
          setLongitude(defaultLng);
          initializeMap(defaultLat, defaultLng);
          initializeSockets(userData.id, defaultLat, defaultLng);
          fetchNearbyTasks(defaultLat, defaultLng);
        }
      );
    } else {
      // Browser doesn't support geolocation, use default center
      const defaultLat = 12.9716;
      const defaultLng = 77.5946;
      setLatitude(defaultLat);
      setLongitude(defaultLng);
      initializeMap(defaultLat, defaultLng);
      initializeSockets(userData.id, defaultLat, defaultLng);
      fetchNearbyTasks(defaultLat, defaultLng);
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
      markerGroup.current = null;
      userMarker.current = null;
    };
  }, [navigate]);

  // Tone generator using Web Audio API to create a premium notification chime (no static assets needed)
  const playNotificationSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      const now = ctx.currentTime;
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        
        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(start);
        osc.stop(start + duration);
      };
      
      // Play a quick two-beep sound (D5 -> A5)
      playTone(587.33, now, 0.12);
      playTone(880.00, now + 0.08, 0.22);
    } catch (err) {
      console.warn('AudioContext failed to initialize:', err);
    }
  };

  // 2. Setup Socket.io connection and coordinate emit heartbeat
  const initializeSockets = (userId: string, initialLat: number, initialLng: number) => {
    const socket = io(API_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to socket.io backend server');
      
      // Emit initial location
      socket.emit('update_location', { userId, lat: initialLat, lng: initialLng });

      // Join user room for direct notifications
      socket.emit('join_user', { userId });

      // Query nearby users initially
      socket.emit('get_nearby_users', { lat: initialLat, lng: initialLng, radiusKm: 10 }, (res: any) => {
        if (res && res.users) {
          setNearbyUsers(res.users);
        }
      });
    });

    socket.on('session_created', (data: { sessionId: string }) => {
      console.log('[Socket] New session created notification received:', data.sessionId);
      fetchUserSessions();
    });

    socket.on('receive_message', (message: Message) => {
      // 1. Append message if it belongs to current active session
      setActiveSessionMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });

      // 2. Increment unread count and trigger notification toast if not current active chat
      const currentActive = activeSessionRef.current;
      const allSessions = sessionsRef.current;

      // Only notify if message is from the other user (not ourselves)
      if (message.senderId !== userId) {
        playNotificationSound();
        if (!currentActive || currentActive.id !== message.sessionId) {
          // Increment unread count
          setUnreadCounts((prev) => ({
            ...prev,
            [message.sessionId]: (prev[message.sessionId] || 0) + 1
          }));

          // Find sender details
          const sessionInfo = allSessions.find((s) => s.id === message.sessionId);
          if (sessionInfo) {
            const isClient = userId === sessionInfo.clientId;
            const otherUser = isClient ? sessionInfo.helper : sessionInfo.client;
            
            setActiveNotification({
              senderName: otherUser?.name || 'Someone',
              content: message.imageUrl ? '📷 Photo' : message.content,
              sessionId: message.sessionId
            });
          }
        }
      }

      fetchUserSessions();
    });

    socket.on('payment_status_updated', (data: { paymentStatus: string; status: string; sessionId?: string }) => {
      setActiveSession((prev) => {
        if (!prev) return null;
        if (data.sessionId && prev.id !== data.sessionId) return prev;
        return {
          ...prev,
          paymentStatus: data.paymentStatus,
          status: data.status
        };
      });
      fetchUserSessions();
      if (latitude && longitude) {
        fetchNearbyTasks(latitude, longitude);
      }
    });

    // Start 8-second coordinate heartbeat updates
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        navigator.geolocation.getCurrentPosition((position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          socket.emit('update_location', {
            userId,
            lat,
            lng
          });
          
          socket.emit('get_nearby_users', { lat, lng, radiusKm: 10 }, (res: any) => {
            if (res && res.users) {
              setNearbyUsers(res.users);
            }
          });
        });
      }
    }, 8000);
    heartbeatIntervalRef.current = heartbeatInterval;
  };

  // 3. Initialize Leaflet Map
  const initializeMap = (centerLat: number, centerLng: number) => {
    if (!mapRef.current || leafletMap.current) return;

    // Create Map
    const map = L.map(mapRef.current, {
      zoomControl: false // We will customize controls later
    }).setView([centerLat, centerLng], 14);

    leafletMap.current = map;

    // Load OpenStreetMap Tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    // Add zoom controls on bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Layer group for task pins
    const pinsGroup = L.layerGroup().addTo(map);
    markerGroup.current = pinsGroup;

    // Layer group for nearby users
    const usersGroup = L.layerGroup().addTo(map);
    userMarkersGroup.current = usersGroup;

    // Current user blue dot indicator marker
    const userIcon = L.divIcon({
      className: 'user-pulse-marker',
      html: `<div style="background-color: #3b82f6; width: 14px; height: 14px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 0 10px #3b82f6;"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const uMarker = L.marker([centerLat, centerLng], { icon: userIcon }).addTo(map);
    userMarker.current = uMarker;

    // Map click sets location coordinate inputs in task form
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setLatitude(lat);
      setLongitude(lng);
      setShowCreateTaskModal(true);
    });
  };

  // 4. Fetch Nearby Tasks
  const fetchNearbyTasks = async (lat: number, lng: number) => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_URL}/api/tasks/nearby?lat=${lat}&lng=${lng}&radius=10`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch tasks.');

      setTasks(data.tasks);
      renderTaskMarkers(data.tasks);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 5. Draw Task Pins on Map
  const renderTaskMarkers = (tasksList: Task[]) => {
    if (!markerGroup.current || !leafletMap.current) return;

    // Clear existing task pins
    markerGroup.current.clearLayers();

    tasksList.forEach((task) => {
      // Determine marker color depending on task paid status
      const markerColor = task.isPaid ? '#0ea5e9' : '#10b981';
      const markerSymbol = task.isPaid ? '$' : '●';

      const customIcon = L.divIcon({
        className: 'task-map-pin',
        html: `<div style="background-color: ${markerColor}; color: white; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-weight: bold; font-family: Outfit, sans-serif; font-size: 14px;">
                <span style="transform: rotate(45deg); display: block; margin-top: -2px;">${markerSymbol}</span>
              </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      });

      // Format interests chips
      const interestsHtml = task.creatorInterests && task.creatorInterests.length > 0
        ? `<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
            ${task.creatorInterests.map(interest => 
              `<span style="font-size: 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #f8fafc; padding: 2px 6px; border-radius: 12px;">${interest}</span>`
            ).join('')}
           </div>`
        : '';

      // Format contact social buttons
      const socialButtonsHtml = `
        <div style="display: flex; gap: 6px; margin-top: 8px; width: 100%;">
          ${task.creatorInstagram ? 
            `<a href="https://instagram.com/${task.creatorInstagram}" target="_blank" style="flex: 1; text-align: center; text-decoration: none; background: linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); color: white; padding: 6px; border-radius: 8px; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 4px;">📸 Instagram</a>` : ''
          }
          ${task.creatorTelegram ? 
            `<a href="https://t.me/${task.creatorTelegram}" target="_blank" style="flex: 1; text-align: center; text-decoration: none; background: #0088cc; color: white; padding: 6px; border-radius: 8px; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 4px;">💬 Telegram</a>` : ''
          }
          ${!task.creatorInstagram && !task.creatorTelegram ? 
            `<span style="font-size: 11px; color: #94a3b8; font-style: italic;">No socials listed</span>` : ''
          }
        </div>
      `;

      const popupHtml = `
        <div style="font-family: 'Inter', sans-serif; min-width: 240px; color: #f8fafc; padding: 8px; background: #0f172a; border-radius: 12px;">
          <!-- Profile Block -->
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px;">
            ${task.creatorAvatar ? 
              `<img src="${task.creatorAvatar}" style="width: 36px; height: 36px; border-radius: 50%; border: 1.5px solid #1d4ed8;" />` :
              `<div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; color: white;">${task.creatorName.charAt(0).toUpperCase()}</div>`
            }
            <div style="text-align: left;">
              <h5 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 13px; color: #f8fafc;">${task.creatorName}</h5>
              <div style="font-size: 10px; color: #fbbf24; display: flex; align-items: center; gap: 2px;">★ ${task.creatorRating.toFixed(1)}</div>
            </div>
          </div>

          <!-- Bio -->
          ${task.creatorBio ? `<p style="font-size: 11px; color: #94a3b8; line-height: 1.4; margin-bottom: 8px; font-style: italic;">"${task.creatorBio}"</p>` : ''}
          
          <!-- Interests -->
          ${interestsHtml}

          <!-- Task details -->
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 8px; border-radius: 8px; margin-top: 8px; text-align: left;">
            <h6 style="margin: 0 0 2px 0; font-size: 12px; color: #f8fafc; font-family: 'Outfit', sans-serif;">${task.title}</h6>
            <p style="margin: 0 0 6px 0; font-size: 11px; color: #94a3b8; line-height: 1.3;">${task.description}</p>
            <span style="background-color: ${task.isPaid ? 'rgba(217, 70, 239, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; color: ${markerColor}; padding: 2px 6px; border-radius: 12px; font-size: 10px; font-weight: bold;">
              ${task.isPaid ? `Paid task ($${task.price})` : 'Free Session'}
            </span>
          </div>

          <!-- Connect Coordinates -->
          ${socialButtonsHtml}
        </div>
      `;

      const lat = typeof task.latitude === 'string' ? parseFloat(task.latitude) : task.latitude;
      const lng = typeof task.longitude === 'string' ? parseFloat(task.longitude) : task.longitude;

      if (lat === undefined || lng === undefined || lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
        return;
      }

      const marker = L.marker([lat, lng], { icon: customIcon })
        .bindPopup(popupHtml);
      
      marker.on('click', () => {
        setSelectedTask(task);
      });
      
      markerGroup.current?.addLayer(marker);
    });
  };

  // 5.1 Draw Nearby Users on Map
  const renderNearbyUsersMarkers = (usersList: any[]) => {
    if (!userMarkersGroup.current || !leafletMap.current) return;
    userMarkersGroup.current.clearLayers();

    usersList.forEach((u) => {
      // Don't show current user again
      if (u.id === user?.id) return;

      const lat = typeof u.lat === 'string' ? parseFloat(u.lat) : u.lat;
      const lng = typeof u.lng === 'string' ? parseFloat(u.lng) : u.lng;

      if (lat === undefined || lng === undefined || lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
        return;
      }

      const userIcon = L.divIcon({
        className: 'nearby-user-map-pin',
        html: `<div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(16, 185, 129, 0.6); font-weight: bold; font-family: Outfit, sans-serif; font-size: 12px; position: relative;">
                ${u.name.charAt(0).toUpperCase()}
                <div style="position: absolute; bottom: -2px; right: -2px; width: 8px; height: 8px; border-radius: 50%; background: #10b981; border: 1.5px solid white; box-shadow: 0 0 4px #10b981;"></div>
              </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      });

      const popupHtml = `
        <div style="font-family: 'Inter', sans-serif; min-width: 180px; color: #f8fafc; padding: 6px; background: #0f172a; border-radius: 10px; text-align: center;">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
            ${u.avatarUrl ? 
              `<img src="${u.avatarUrl}" style="width: 32px; height: 32px; border-radius: 50%; border: 1.5px solid #10b981;" />` :
              `<div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #10b981 0%, #059669 100%); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; color: white;">${u.name.charAt(0).toUpperCase()}</div>`
            }
            <span style="font-size: 12px; font-weight: bold; color: #f8fafc;">${u.name}</span>
            <span style="font-size: 10px; color: #fbbf24;">★ ${u.rating.toFixed(1)}</span>
            <span style="font-size: 10px; color: #10b981; font-weight: 600;">Active Nearby</span>
          </div>
        </div>
      `;

      const marker = L.marker([lat, lng], { icon: userIcon })
        .bindPopup(popupHtml);

      userMarkersGroup.current?.addLayer(marker);
    });
  };

  useEffect(() => {
    renderNearbyUsersMarkers(nearbyUsers);
  }, [nearbyUsers, user]);

  // 6. Submit/Create Task Pin
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || latitude === null || longitude === null) {
      setError('Please provide title, description, and click on the map to set a pin location.');
      return;
    }

    setSubmitting(true);
    setError(null);
    const token = localStorage.getItem('token');

    try {
      const response = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title,
          description,
          price: isPaid ? parseFloat(price) : 0,
          isPaid,
          latitude,
          longitude
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to post task.');

      // Clear Form
      setTitle('');
      setDescription('');
      setPrice('0');
      setIsPaid(false);

      // Refresh list
      fetchNearbyTasks(latitude, longitude);

      // Center map
      if (leafletMap.current) {
        leafletMap.current.setView([latitude, longitude], 14);
      }
      setSelectedTask(null);
      setActiveSession(null);
      setActiveTab('tasks');
      setShowCreateTaskModal(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const fetchUserSessions = async () => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_URL}/api/sessions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok) {
        setSessions(data.sessions);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  };

  const handleApplyToTask = async (taskId: string) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ taskId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to join task.');

      fetchUserSessions();
      handleOpenSession(data.session.id);
      setSelectedTask(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleOpenSession = async (sessionId: string) => {
    setUnreadCounts((prev) => ({ ...prev, [sessionId]: 0 }));
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load session.');

      setActiveSession(data.session);
      setActiveSessionMessages(data.session.messages || []);
      
      if (socketRef.current) {
        socketRef.current.emit('join_session', { sessionId });
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 600;
          const MAX_HEIGHT = 600;
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
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            resolve(dataUrl);
          } else {
            reject(new Error('Canvas context could not be created'));
          }
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const triggerCameraCapture = async () => {
    setShowCameraModal(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      setCameraStream(stream);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(err => console.error("Error playing video stream:", err));
        }
      }, 100);
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Could not access camera. Please check permissions.");
      setShowCameraModal(false);
    }
  };

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCameraModal(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);

        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 600;
        let targetWidth = width;
        let targetHeight = height;

        if (targetWidth > targetHeight) {
          if (targetWidth > MAX_WIDTH) {
            targetHeight *= MAX_WIDTH / targetWidth;
            targetWidth = MAX_WIDTH;
          }
        } else {
          if (targetHeight > MAX_HEIGHT) {
            targetWidth *= MAX_HEIGHT / targetHeight;
            targetHeight = MAX_HEIGHT;
          }
        }

        const compressCanvas = document.createElement('canvas');
        compressCanvas.width = targetWidth;
        compressCanvas.height = targetHeight;
        const compressCtx = compressCanvas.getContext('2d');
        if (compressCtx) {
          compressCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
          const dataUrl = compressCanvas.toDataURL('image/jpeg', 0.7);
          setSelectedImage(dataUrl);
        }
      }
      closeCamera();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setSelectedImage(compressed);
      } catch (err) {
        console.error("Compression error:", err);
        setError("Failed to process selected image.");
      }
    }
    e.target.value = '';
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedImage) || !activeSession || !user) return;

    if (socketRef.current) {
      socketRef.current.emit('send_message', {
        sessionId: activeSession.id,
        senderId: user.id,
        content: newMessage.trim(),
        imageUrl: selectedImage || undefined
      });
    }

    setNewMessage('');
    setSelectedImage(null);
  };

  const handleApplyPromo = () => {
    if (promoCode.trim().toUpperCase() === 'DOGETHER10') {
      setDiscount(0.1);
      setPromoSuccess('Promo code applied successfully! 10% discount applied.');
      setPromoError(null);
    } else {
      setPromoError('Invalid promo code. Try "DOGETHER10".');
      setPromoSuccess(null);
    }
  };

  const handleProcessPayment = async () => {
    if (!activeSession) return;

    if (paymentMethod === 'gpay' || paymentMethod === 'phonepe') {
      setShowPaymentModal(false);
      setActiveRedirectGateway(paymentMethod);
      setGatewayStep('idle');
      setGatewayPin('');
      return;
    }

    setPaymentLoading(true);
    setPaymentStep('redirecting');

    try {
      // Step 1: Simulated redirection delay
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setPaymentStep('authorizing');

      // Step 2: Simulated bank authorization delay
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/sessions/${activeSession.id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to complete payment.');

      // Step 3: Success checkmark animation delay
      setPaymentStep('success');
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (socketRef.current) {
        socketRef.current.emit('trigger_payment_status', {
          sessionId: activeSession.id,
          paymentStatus: 'PAID',
          status: 'COMPLETED'
        });
      }

      setShowPaymentModal(false);
      setPaymentStep('idle');
      setPaymentCardNumber('');
      setPaymentCardName('');
      setPaymentCardExpiry('');
      setPaymentCardCvv('');
      setPhonePeUpiId('');
      setPromoCode('');
      setDiscount(0);
      setPromoError(null);
      setPromoSuccess(null);

      fetchUserSessions();
      if (latitude && longitude) {
        fetchNearbyTasks(latitude, longitude);
      }
    } catch (err: any) {
      setError(err.message);
      setPaymentStep('idle');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleProcessRedirectedPayment = async () => {
    if (!activeSession) return;
    setGatewayStep('authorizing');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/sessions/${activeSession.id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to complete payment.');

      setGatewayStep('success');

      if (socketRef.current) {
        socketRef.current.emit('trigger_payment_status', {
          sessionId: activeSession.id,
          paymentStatus: 'PAID',
          status: 'COMPLETED'
        });
      }

      setTimeout(() => {
        setActiveRedirectGateway(null);
        setGatewayStep('idle');
        fetchUserSessions();
        if (latitude && longitude) {
          fetchNearbyTasks(latitude, longitude);
        }
      }, 2200);
    } catch (err: any) {
      setError(err.message);
      setGatewayStep('idle');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to delete this task pin?')) return;
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_URL}/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete task.');

      setSelectedTask(null);
      if (latitude && longitude) {
        fetchNearbyTasks(latitude, longitude);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="dashboard-layout" style={{ background: '#0b0c10', color: '#f8fafc' }}>      {/* Sidebar Section */}
      <div className="sidebar" style={{ background: 'rgba(17, 18, 25, 0.95)', padding: '24px 24px 0 24px', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        
        {/* Header Block (Always visible) */}
        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {/* User Info Header */}
          {user && (
            <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ position: 'relative' }}>
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} style={{ width: '42px', height: '42px', borderRadius: '50%', border: '2px solid var(--primary)' }} />
                    ) : (
                      <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '16px' }}>
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'Outfit' }}>{user.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Award size={12} color="#f59e0b" fill="#f59e0b" />
                      Rating: {user.rating.toFixed(1)}
                    </div>
                  </div>
                </div>
                <button onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} title="Log Out">
                  <LogOut size={20} />
                </button>
              </div>
              
              {user.bio && (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'left', marginBottom: '10px' }}>
                  "{user.bio}"
                </p>
              )}

              {user.interests && user.interests.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                  {user.interests.map((interest: string) => (
                    <span key={interest} style={{ fontSize: '0.72rem', background: 'rgba(14, 165, 233, 0.1)', color: 'var(--text-primary)', border: '1px solid rgba(14, 165, 233, 0.2)', padding: '2px 8px', borderRadius: '12px', fontWeight: 500 }}>
                      {interest}
                    </span>
                  ))}
                </div>
              )}

              <button 
                onClick={() => navigate('/profile-setup')} 
                className="btn-secondary" 
                style={{ width: '100%', marginTop: '14px', padding: '8px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '36px' }}
              >
                <Edit2 size={13} /> Edit Profile & Hobbies
              </button>
            </div>
          )}

          {error && (
            <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <ShieldAlert size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Create Task Toggle Button */}
          <button 
            onClick={() => {
              if (latitude === null || longitude === null) {
                setError("Please select a location on the map to drop a pin.");
                setTimeout(() => setError(null), 4000);
              }
              setShowCreateTaskModal(true);
            }} 
            className="btn-primary" 
            style={{ width: '100%', marginBottom: '16px', padding: '12px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Plus size={18} /> Post a Task (Drop Pin)
          </button>

          {/* Tabs for Tasks vs Chats */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', marginBottom: '12px' }}>
            <button 
              onClick={() => setActiveTab('tasks')}
              className={`tab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Outfit',
                fontWeight: 600,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: activeTab === 'tasks' ? 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)' : 'rgba(255,255,255,0.02)',
                color: '#ffffff',
                transition: 'var(--transition)',
                boxShadow: activeTab === 'tasks' ? '0 4px 12px rgba(29, 78, 216, 0.25)' : 'none'
              }}
            >
              <Compass size={14} /> Nearby Pins ({tasks.length})
            </button>
            <button 
              onClick={() => setActiveTab('chats')}
              className={`tab-btn ${activeTab === 'chats' ? 'active' : ''}`}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Outfit',
                fontWeight: 600,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: activeTab === 'chats' ? 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)' : 'rgba(255,255,255,0.02)',
                color: '#ffffff',
                transition: 'var(--transition)',
                boxShadow: activeTab === 'chats' ? '0 4px 12px rgba(29, 78, 216, 0.25)' : 'none'
              }}
            >
              <MessageSquare size={14} /> Chats ({sessions.length})
            </button>
          </div>
        </div>

        {/* Scrollable Content Container */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '24px', marginRight: '-12px', paddingRight: '8px' }}>
          {activeTab === 'tasks' ? (
            <div>
              <h3 style={{ fontFamily: 'Outfit', fontSize: '1.1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                <Compass size={16} /> Active Nearby Pins
              </h3>

              {loading ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>Loading nearby tasks...</div>
              ) : tasks.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '20px', background: 'rgba(255,255,255,0.01)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.05)' }}>
                  No active pins near you. Be the first to drop one!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {tasks.map((task) => (
                    <div 
                      key={task.id} 
                      className="glass-panel task-card" 
                      onClick={() => leafletMap.current?.setView([task.latitude, task.longitude], 15)}
                      style={{ padding: '16px' }}
                    >
                      {/* Creator Profile Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {task.creatorAvatar ? (
                            <img src={task.creatorAvatar} alt={task.creatorName} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--primary)' }} />
                          ) : (
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '11px', color: 'white' }}>
                              {task.creatorName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, fontFamily: 'Outfit' }}>{task.creatorName}</div>
                            <div style={{ fontSize: '0.7rem', color: '#fbbf24' }}>★ {task.creatorRating.toFixed(1)}</div>
                          </div>
                        </div>
                        {user?.id === task.creatorId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTask(task.id);
                            }}
                            style={{
                              background: 'rgba(239, 68, 68, 0.08)',
                              border: 'none',
                              color: '#fca5a5',
                              cursor: 'pointer',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '0.72rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              transition: 'var(--transition)'
                            }}
                            title="Delete Task"
                            className="delete-task-btn"
                          >
                            🗑️ Delete
                          </button>
                        )}
                      </div>

                      {/* Creator Bio & Hobbies */}
                      {task.creatorBio && (
                        <p style={{ fontSize: '0.78rem', fontStyle: 'italic', color: 'var(--text-secondary)', marginBottom: '8px', textAlign: 'left' }}>
                          "{task.creatorBio}"
                        </p>
                      )}

                      {task.creatorInterests && task.creatorInterests.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px', justifyContent: 'flex-start' }}>
                          {task.creatorInterests.map((interest) => (
                            <span key={interest} style={{ fontSize: '0.68rem', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                              {interest}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Task details */}
                      <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', marginBottom: '10px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                          <h4 style={{ fontSize: '0.92rem', margin: 0, fontFamily: 'Outfit', fontWeight: 650 }}>{task.title}</h4>
                          <span style={{
                            backgroundColor: task.isPaid ? 'rgba(217, 70, 239, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: task.isPaid ? 'var(--accent)' : 'var(--success)',
                            fontSize: '0.68rem', fontWeight: 'bold', padding: '1px 5px', borderRadius: '8px'
                          }}>
                            {task.isPaid ? `$${task.price}` : 'Free'}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>{task.description}</p>
                      </div>

                      {/* Footer social links and distance */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          <MapPin size={11} />
                          <span>{task.distance ? `${task.distance.toFixed(1)} km` : '0 km'} away</span>
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          {task.creatorInstagram && (
                            <a 
                              href={`https://instagram.com/${task.creatorInstagram}`} 
                              target="_blank" 
                              rel="noreferrer"
                              style={{ textDecoration: 'none', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', padding: '3px 6px', borderRadius: '5px', fontSize: '0.7rem', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '3px' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              Instagram
                            </a>
                          )}
                          {task.creatorTelegram && (
                            <a 
                              href={`https://t.me/${task.creatorTelegram}`} 
                              target="_blank" 
                              rel="noreferrer"
                              style={{ textDecoration: 'none', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', padding: '3px 6px', borderRadius: '5px', fontSize: '0.7rem', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '3px' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              Telegram
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <h3 style={{ fontFamily: 'Outfit', fontSize: '1.1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                <MessageSquare size={16} /> Discussions ({sessions.length})
              </h3>
              
              {(() => {
                const activeSessions = sessions.filter(s => s.status !== 'COMPLETED');
                const completedSessions = sessions.filter(s => s.status === 'COMPLETED');

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {activeSessions.length === 0 && completedSessions.length === 0 ? (
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                        No active discussions. Tap a task pin on the map to chat and offer help!
                      </div>
                    ) : (
                      <>
                        {activeSessions.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {activeSessions.map((session) => {
                              const isClient = user?.id === session.clientId;
                              const otherUser = isClient ? session.helper : session.client;
                              const activeLabel = isClient ? 'Helper' : 'Creator';
                              const statusColor = 'var(--primary)';
                              
                              return (
                                <div 
                                  key={session.id}
                                  className={`discussion-card glass-panel ${activeSession?.id === session.id ? 'active' : ''}`}
                                  onClick={() => handleOpenSession(session.id)}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                                      {session.task?.title}
                                    </span>
                                    <span style={{ fontSize: '0.7rem', color: statusColor, fontWeight: 'bold' }}>
                                      {session.status}
                                    </span>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                                    {otherUser?.avatarUrl ? (
                                      <img src={otherUser.avatarUrl} alt={otherUser.name} style={{ width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0 }} />
                                    ) : (
                                      <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px', color: 'white', flexShrink: 0 }}>
                                        {otherUser?.name?.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          {otherUser?.name}
                                          {unreadCounts[session.id] > 0 && (
                                            <span style={{
                                              background: 'var(--primary)',
                                              color: 'white',
                                              fontSize: '0.65rem',
                                              padding: '1px 6px',
                                              borderRadius: '10px',
                                              fontWeight: 800
                                            }}>
                                              {unreadCounts[session.id]}
                                            </span>
                                          )}
                                        </span>
                                        {(() => {
                                          const lastMsg = session.messages && session.messages.length > 0 ? session.messages[0] : null;
                                          if (!lastMsg) return null;
                                          return (
                                            <span style={{ fontSize: '0.7rem', color: unreadCounts[session.id] > 0 ? 'var(--primary)' : 'var(--text-muted)', fontWeight: unreadCounts[session.id] > 0 ? 'bold' : 'normal' }}>
                                              {new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                          );
                                        })()}
                                      </div>
                                      
                                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', marginTop: '2px', textAlign: 'left' }}>
                                        {(() => {
                                          const lastMsg = session.messages && session.messages.length > 0 ? session.messages[0] : null;
                                          if (!lastMsg) return 'No messages yet';
                                          return lastMsg.imageUrl ? '📷 Photo' : lastMsg.content;
                                        })()}
                                      </div>

                                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', textAlign: 'left' }}>
                                        {activeLabel} • {session.task?.isPaid ? `Paid ($${session.task.price})` : 'Free'}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {completedSessions.length > 0 && (
                          <div style={{ marginTop: '10px' }}>
                            <button
                              onClick={() => setShowCompletedChats(!showCompletedChats)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                width: '100%',
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                color: 'var(--text-secondary)',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                transition: 'var(--transition)'
                              }}
                            >
                              <span>📁 Completed Discussions ({completedSessions.length})</span>
                              <span>{showCompletedChats ? '▼' : '►'}</span>
                            </button>

                            {showCompletedChats && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                                {completedSessions.map((session) => {
                                  const isClient = user?.id === session.clientId;
                                  const otherUser = isClient ? session.helper : session.client;
                                  const activeLabel = isClient ? 'Helper' : 'Creator';
                                  
                                  return (
                                    <div 
                                      key={session.id}
                                      className={`discussion-card glass-panel ${activeSession?.id === session.id ? 'active' : ''}`}
                                      onClick={() => handleOpenSession(session.id)}
                                      style={{ opacity: 0.6 }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                                          {session.task?.title}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 'bold' }}>
                                          COMPLETED
                                        </span>
                                      </div>

                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                                        {otherUser?.avatarUrl ? (
                                          <img src={otherUser.avatarUrl} alt={otherUser.name} style={{ width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0 }} />
                                        ) : (
                                          <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--text-muted) 0%, rgba(255,255,255,0.1) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px', color: 'white', flexShrink: 0 }}>
                                            {otherUser?.name?.charAt(0).toUpperCase()}
                                          </div>
                                        )}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{otherUser?.name}</span>
                                          </div>
                                          
                                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', marginTop: '2px', textAlign: 'left' }}>
                                            Task finished & paid
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Task Details Side Panel */}
      {selectedTask && (
        <div className="active-task-card-overlay" style={{ padding: '32px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1.4rem', fontFamily: 'Outfit', margin: 0 }}>Task Details</h2>
            <button 
              onClick={() => setSelectedTask(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={24} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {selectedTask.creatorAvatar ? (
              <img src={selectedTask.creatorAvatar} alt={selectedTask.creatorName} style={{ width: '48px', height: '48px', borderRadius: '50%', border: '2px solid var(--primary)' }} />
            ) : (
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)', display: 'flex', alignItems: 'center', justifycontent: 'center', fontWeight: 'bold', fontSize: '18px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {selectedTask.creatorName.charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{selectedTask.creatorName}</div>
              <div style={{ fontSize: '0.8rem', color: '#fbbf24' }}>★ {selectedTask.creatorRating.toFixed(1)}</div>
            </div>
          </div>

          {selectedTask.creatorBio && (
            <div style={{ marginBottom: '20px', textAlign: 'left' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Creator Bio</span>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '4px 0 0 0' }}>
                "{selectedTask.creatorBio}"
              </p>
            </div>
          )}

          {selectedTask.creatorInterests && selectedTask.creatorInterests.length > 0 && (
            <div style={{ marginBottom: '24px', textAlign: 'left' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Interests</span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {selectedTask.creatorInterests.map(interest => 
                  <span key={interest} style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', padding: '3px 8px', borderRadius: '12px' }}>{interest}</span>
                )}
              </div>
            </div>
          )}

          <div className="glass-panel" style={{ padding: '24px', textAlign: 'left', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '1.25rem', margin: '0 0 8px 0', fontFamily: 'Outfit' }}>{selectedTask.title}</h3>
            <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: 1.5 }}>{selectedTask.description}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{
                backgroundColor: selectedTask.isPaid ? 'rgba(217, 70, 239, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                color: selectedTask.isPaid ? 'var(--accent)' : 'var(--success)',
                fontSize: '0.8rem', fontWeight: 'bold', padding: '4px 10px', borderRadius: '12px'
              }}>
                {selectedTask.isPaid ? `Paid task ($${selectedTask.price})` : 'Free Session'}
              </span>
              {selectedTask.distance && (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedTask.distance.toFixed(2)} km away</span>
              )}
            </div>
          </div>

          {user?.id === selectedTask.creatorId ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic', textAlign: 'left' }}>
                This is your task post. Watch the sidebar for helper chats!
              </div>
              <button 
                onClick={() => handleDeleteTask(selectedTask.id)} 
                className="btn-secondary" 
                style={{ width: '100%', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5', padding: '12px', fontSize: '0.95rem', background: 'rgba(239, 68, 68, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                🗑️ Remove Task Pin
              </button>
            </div>
          ) : (
            <button 
              onClick={() => handleApplyToTask(selectedTask.id)} 
              className="btn-primary" 
              style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
            >
              <MessageSquare size={18} /> Offer Help & Chat Now
            </button>
          )}
        </div>
      )}

      {/* Chat Drawer Side Panel */}
      {activeSession && (
        <div className="chat-panel">
          {/* Chat Header */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {(() => {
                const otherUser = user?.id === activeSession.clientId ? activeSession.helper : activeSession.client;
                return (
                  <>
                    {otherUser?.avatarUrl ? (
                      <img src={otherUser.avatarUrl} alt={otherUser.name} style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
                    ) : (
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '14px', color: 'white' }}>
                        {otherUser?.name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{otherUser?.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                        Re: {activeSession.task?.title}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
            <button 
              onClick={() => setActiveSession(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={22} />
            </button>
          </div>

          {/* Payment Status Bar */}
          {activeSession.task?.isPaid && (
            <div style={{ 
              padding: '12px 24px', 
              background: activeSession.paymentStatus === 'PAID' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(29, 78, 216, 0.08)',
              borderBottom: '1px solid var(--panel-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <span style={{ fontSize: '0.8rem', fontWeight: 650, color: activeSession.paymentStatus === 'PAID' ? 'var(--success)' : 'var(--text-primary)' }}>
                  {activeSession.paymentStatus === 'PAID' ? 'Task Paid & Completed! 🎉' : `Budget: $${activeSession.task.price}`}
                </span>
              </div>
              {user?.id === activeSession.clientId && activeSession.paymentStatus !== 'PAID' && (
                <button 
                  onClick={() => setShowPaymentModal(true)}
                  className="btn-primary" 
                  style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '8px', height: '28px', boxShadow: 'none' }}
                >
                  <CreditCard size={12} /> Release Payment
                </button>
              )}
            </div>
          )}

          {/* Chat Messages */}
          <div className="chat-messages">
            {activeSessionMessages.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 'auto', textAlign: 'center' }}>
                No messages yet. Send a message to start cooperating!
              </div>
            ) : (
              activeSessionMessages.map((msg) => {
                const isMe = msg.senderId === user?.id;
                return (
                  <div key={msg.id} className={`message-bubble ${isMe ? 'sender' : 'receiver'}`} style={{ display: 'flex', flexDirection: 'column' }}>
                    {msg.imageUrl && (
                      <img 
                        src={msg.imageUrl} 
                        alt="Shared attachment" 
                        style={{ 
                          maxWidth: '100%', 
                          maxHeight: '240px', 
                          borderRadius: '8px', 
                          objectFit: 'cover', 
                          marginBottom: msg.content ? '8px' : '0', 
                          cursor: 'pointer',
                          border: '1px solid rgba(255,255,255,0.08)'
                        }}
                        onClick={() => setLightboxImage(msg.imageUrl || null)}
                      />
                    )}
                    {msg.content && <span>{msg.content}</span>}
                  </div>
                );
              })
            )}
          </div>

          {/* Message Input Form */}
          {activeSession.status === 'COMPLETED' ? (
            <div style={{ padding: '20px 24px', borderTop: '1px solid var(--panel-border)', background: 'rgba(16, 185, 129, 0.04)', color: 'var(--success)', fontSize: '0.85rem', fontWeight: 600, textAlign: 'center' }}>
              This task has been completed and closed.
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              {/* Image Preview Bar */}
              {selectedImage && (
                <div style={{
                  padding: '10px 24px',
                  borderTop: '1px solid var(--panel-border)',
                  background: 'rgba(255,255,255,0.03)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <div style={{ position: 'relative', width: '50px', height: '50px' }}>
                    <img
                      src={selectedImage}
                      alt="Upload preview"
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '6px',
                        objectFit: 'cover',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedImage(null)}
                      style={{
                        position: 'absolute',
                        top: '-6px',
                        right: '-6px',
                        background: 'var(--danger)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '50%',
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
                      }}
                    >
                      <X size={10} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Image Attachment</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Ready to send</span>
                  </div>
                </div>
              )}

              {/* Attach Dropdown Menu */}
              {showAttachMenu && (
                <div style={{
                  position: 'absolute',
                  bottom: '68px',
                  left: '24px',
                  background: 'rgba(15, 17, 26, 0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  zIndex: 1010,
                  width: '180px',
                  backdropFilter: 'blur(10px)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachMenu(false);
                      triggerCameraCapture();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 16px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '0.85rem',
                      width: '100%',
                      transition: 'var(--transition)'
                    }}
                    className="attach-menu-item"
                  >
                    <Camera size={16} color="var(--primary)" /> Capture Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachMenu(false);
                      fileInputRef.current?.click();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 16px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '0.85rem',
                      width: '100%',
                      transition: 'var(--transition)',
                      borderTop: '1px solid rgba(255,255,255,0.06)'
                    }}
                    className="attach-menu-item"
                  >
                    <Image size={16} color="var(--accent)" /> Upload from Gallery
                  </button>
                </div>
              )}

              <form onSubmit={handleSendMessage} style={{ padding: '16px 24px', borderTop: '1px solid var(--panel-border)', display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.01)', alignItems: 'center' }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*"
                  style={{ display: 'none' }}
                />
                
                <button
                  type="button"
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  className="btn-secondary"
                  style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Camera size={18} />
                </button>

                <input 
                  className="form-input" 
                  placeholder="Type your message..." 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  style={{ borderRadius: '24px', padding: '10px 18px', fontSize: '0.9rem' }}
                  required={!selectedImage}
                />
                
                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ borderRadius: '50%', width: '40px', height: '40px', padding: 0, flexShrink: 0, boxShadow: 'none' }}
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Mock Payment Backdrop & Modal */}
      {showPaymentModal && activeSession && (() => {
        const basePrice = activeSession.task?.price || 0;
        const serviceFee = basePrice * 0.05;
        const discountAmount = (basePrice + serviceFee) * discount;
        const finalTotal = basePrice + serviceFee - discountAmount;

        return (
          <div className="payment-modal-backdrop">
            <div className="payment-modal" style={{ maxWidth: '720px', width: '90%', textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
              {paymentStep === 'idle' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '14px' }}>
                    <h3 style={{ fontSize: '1.3rem', fontFamily: 'Outfit', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      🔒 Secure Checkout
                    </h3>
                    <button 
                      onClick={() => {
                        setShowPaymentModal(false);
                        setPaymentMethod('card');
                        setPromoCode('');
                        setDiscount(0);
                        setPromoError(null);
                        setPromoSuccess(null);
                        setPhonePeUpiId('');
                      }} 
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="payment-grid">
                    {/* Left Column: Payment Methods Selection */}
                    <div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Select a Payment Method
                        </h4>

                        {/* Card Option */}
                        <label style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: paymentMethod === 'card' ? '1.5px solid var(--primary)' : '1px solid rgba(255,255,255,0.08)',
                          background: paymentMethod === 'card' ? 'rgba(29, 78, 216, 0.05)' : 'rgba(255,255,255,0.01)',
                          cursor: 'pointer',
                          transition: 'var(--transition)'
                        }}>
                          <input 
                            type="radio" 
                            name="payment_method" 
                            checked={paymentMethod === 'card'} 
                            onChange={() => setPaymentMethod('card')} 
                            style={{ marginTop: '3px', accentColor: 'var(--primary)' }}
                          />
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              💳 Credit or Debit Card
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginTop: '1px' }}>
                              Visa, Mastercard, RuPay
                            </span>
                          </div>
                        </label>

                        {/* GPay Option */}
                        <label style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: paymentMethod === 'gpay' ? '1.5px solid var(--primary)' : '1px solid rgba(255,255,255,0.08)',
                          background: paymentMethod === 'gpay' ? 'rgba(29, 78, 216, 0.05)' : 'rgba(255,255,255,0.01)',
                          cursor: 'pointer',
                          transition: 'var(--transition)'
                        }}>
                          <input 
                            type="radio" 
                            name="payment_method" 
                            checked={paymentMethod === 'gpay'} 
                            onChange={() => setPaymentMethod('gpay')} 
                            style={{ marginTop: '3px', accentColor: 'var(--primary)' }}
                          />
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              📱 Google Pay (GPay)
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginTop: '1px' }}>
                              Pay instantly via Google Pay UPI
                            </span>
                          </div>
                        </label>

                        {/* PhonePe Option */}
                        <label style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: paymentMethod === 'phonepe' ? '1.5px solid var(--primary)' : '1px solid rgba(255,255,255,0.08)',
                          background: paymentMethod === 'phonepe' ? 'rgba(29, 78, 216, 0.05)' : 'rgba(255,255,255,0.01)',
                          cursor: 'pointer',
                          transition: 'var(--transition)'
                        }}>
                          <input 
                            type="radio" 
                            name="payment_method" 
                            checked={paymentMethod === 'phonepe'} 
                            onChange={() => setPaymentMethod('phonepe')} 
                            style={{ marginTop: '3px', accentColor: 'var(--primary)' }}
                          />
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              📱 PhonePe
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginTop: '1px' }}>
                              UPI request to PhonePe app
                            </span>
                          </div>
                        </label>

                        {/* Cash Option / COD */}
                        <label style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: paymentMethod === 'cod' ? '1.5px solid var(--primary)' : '1px solid rgba(255,255,255,0.08)',
                          background: paymentMethod === 'cod' ? 'rgba(29, 78, 216, 0.05)' : 'rgba(255,255,255,0.01)',
                          cursor: 'pointer',
                          transition: 'var(--transition)'
                        }}>
                          <input 
                            type="radio" 
                            name="payment_method" 
                            checked={paymentMethod === 'cod'} 
                            onChange={() => setPaymentMethod('cod')} 
                            style={{ marginTop: '3px', accentColor: 'var(--primary)' }}
                          />
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              🤝 Settle in Cash (COD)
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginTop: '1px' }}>
                              Pay the helper directly in person
                            </span>
                          </div>
                        </label>
                      </div>

                      {/* Details section */}
                      <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
                        {paymentMethod === 'card' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.75rem' }}>Card Number</label>
                              <input 
                                type="text" 
                                maxLength={16}
                                placeholder="4111 2222 3333 4444" 
                                className="form-input" 
                                value={paymentCardNumber}
                                onChange={(e) => setPaymentCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                                required
                              />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.75rem' }}>Cardholder Name</label>
                              <input 
                                type="text" 
                                placeholder="Alex Johnson" 
                                className="form-input" 
                                value={paymentCardName}
                                onChange={(e) => setPaymentCardName(e.target.value.slice(0, 32))}
                                required
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                              <div className="form-group" style={{ margin: 0, flex: 1.2 }}>
                                <label className="form-label" style={{ fontSize: '0.75rem' }}>Expiry (MM/YY)</label>
                                <input 
                                  type="text" 
                                  maxLength={5}
                                  placeholder="12/28" 
                                  className="form-input" 
                                  value={paymentCardExpiry}
                                  onChange={(e) => {
                                    let val = e.target.value.replace(/\D/g, '');
                                    if (val.length > 2) {
                                      val = val.slice(0, 2) + '/' + val.slice(2, 4);
                                    }
                                    setPaymentCardExpiry(val);
                                  }}
                                  required
                                />
                              </div>
                              <div className="form-group" style={{ margin: 0, flex: 0.8 }}>
                                <label className="form-label" style={{ fontSize: '0.75rem' }}>CVV</label>
                                <input 
                                  type="password" 
                                  maxLength={3}
                                  placeholder="•••" 
                                  className="form-input" 
                                  value={paymentCardCvv}
                                  onChange={(e) => setPaymentCardCvv(e.target.value.replace(/\D/g, '').slice(0, 3))}
                                  required
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {paymentMethod === 'gpay' && (
                          <div className="glass-panel" style={{ padding: '16px', background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px', marginBottom: '8px' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Google Account</span>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{user?.email}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>UPI Handle</span>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{user?.email ? `${user.email.split('@')[0]}@okaxis` : 'dogether@okaxis'}</span>
                            </div>
                          </div>
                        )}

                        {paymentMethod === 'phonepe' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.75rem' }}>PhonePe UPI ID / Mobile Number</label>
                              <input 
                                type="text" 
                                placeholder="9876543210@ybl" 
                                className="form-input" 
                                value={phonePeUpiId}
                                onChange={(e) => setPhonePeUpiId(e.target.value)}
                                required
                              />
                            </div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              A direct payment authorization pop-up will appear on your PhonePe App.
                            </span>
                          </div>
                        )}

                        {paymentMethod === 'cod' && (
                          <div className="glass-panel" style={{ padding: '16px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                            <p style={{ fontSize: '0.8rem', color: '#a7f3d0', margin: 0, lineHeight: 1.4 }}>
                              <strong> Settle in Cash (COD) Mode</strong>
                              <br />
                              Confirming will directly mark this session complete. Settle the fee with the helper in person.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Order Summary Block */}
                    <div className="glass-panel" style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', display: 'flex', flexDirection: 'column', height: 'fit-content' }}>
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', marginBottom: '14px', fontFamily: 'Outfit' }}>
                        Order Summary
                      </h4>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Items:</span>
                          <span>${basePrice.toFixed(2)}</span>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Service Fee (5%):</span>
                          <span>${serviceFee.toFixed(2)}</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Secure Transfer:</span>
                          <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>FREE</span>
                        </div>

                        {discount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#f43f5e', fontWeight: 600 }}>
                            <span>Promotion Discount (10%):</span>
                            <span>-${discountAmount.toFixed(2)}</span>
                          </div>
                        )}

                        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          <span>Order Total:</span>
                          <span style={{ color: 'var(--accent)' }}>${finalTotal.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Promo Box */}
                      <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input 
                            type="text" 
                            placeholder="Promo Code" 
                            className="form-input" 
                            style={{ padding: '8px 12px', fontSize: '0.8rem', borderRadius: '8px', height: '36px', width: '120px' }}
                            value={promoCode}
                            onChange={(e) => setPromoCode(e.target.value)}
                          />
                          <button 
                            type="button" 
                            onClick={handleApplyPromo}
                            className="btn-secondary" 
                            style={{ padding: '0 12px', fontSize: '0.8rem', borderRadius: '8px', height: '36px', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}
                          >
                            Apply
                          </button>
                        </div>
                        {promoError && <span style={{ fontSize: '0.72rem', color: 'var(--danger)', display: 'block', marginTop: '6px' }}>{promoError}</span>}
                        {promoSuccess && <span style={{ fontSize: '0.72rem', color: 'var(--success)', display: 'block', marginTop: '6px' }}>{promoSuccess}</span>}
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '8px' }}>
                          Tip: Enter code <strong>DOGETHER10</strong> for 10% off!
                        </span>
                      </div>

                      {/* Complete Order Button */}
                      <button 
                        onClick={handleProcessPayment}
                        disabled={paymentLoading || (paymentMethod === 'card' && (!paymentCardNumber || !paymentCardName || !paymentCardExpiry || !paymentCardCvv)) || (paymentMethod === 'phonepe' && !phonePeUpiId)}
                        className="btn-primary" 
                        style={{ width: '100%', padding: '12px', fontSize: '0.95rem', borderRadius: '10px', height: '44px', marginTop: '24px' }}
                      >
                        {paymentLoading ? 'Processing Checkout...' : 'Place Your Order'}
                      </button>

                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', textAlign: 'center', marginTop: '10px', lineHeight: 1.3 }}>
                        By placing your order, you agree to Dogether's Terms & Conditions.
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px 20px',
                  textAlign: 'center',
                  minHeight: '320px',
                  animation: 'fadeIn 0.3s ease-out',
                  width: '100%'
                }}>
                  {paymentStep === 'redirecting' && (
                    <>
                      <div className="payment-spinner" style={{
                        width: '64px',
                        height: '64px',
                        border: '4px solid rgba(29, 78, 216, 0.1)',
                        borderTop: '4px solid var(--accent)',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        marginBottom: '24px'
                      }} />
                      <h4 style={{ fontFamily: 'Outfit', fontSize: '1.25rem', marginBottom: '8px', color: '#f8fafc' }}>
                        {paymentMethod === 'gpay' ? 'Connecting to Google Pay...' :
                         paymentMethod === 'phonepe' ? 'Redirecting to PhonePe Gateway...' :
                         paymentMethod === 'cod' ? 'Verifying Cash Mode...' :
                         'Securing Card Authorization...'}
                      </h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Please do not close this window or refresh the page.
                      </p>
                    </>
                  )}

                  {paymentStep === 'authorizing' && (
                    <>
                      <div style={{ position: 'relative', width: '64px', height: '64px', marginBottom: '24px' }}>
                        <div className="payment-spinner" style={{
                          position: 'absolute',
                          inset: 0,
                          border: '4px solid transparent',
                          borderTop: '4px solid var(--primary)',
                          borderRadius: '50%',
                          animation: 'spin 1.2s linear infinite'
                        }} />
                        <div className="payment-spinner" style={{
                          position: 'absolute',
                          inset: '6px',
                          border: '4px solid transparent',
                          borderBottom: '4px solid var(--accent)',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite reverse'
                        }} />
                      </div>
                      <h4 style={{ fontFamily: 'Outfit', fontSize: '1.25rem', marginBottom: '8px', color: '#f8fafc' }}>
                        Confirming Secure Transaction...
                      </h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Authenticating with the payment service provider.
                      </p>
                    </>
                  )}

                  {paymentStep === 'success' && (
                    <>
                      <div style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: '50%',
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '3px solid var(--success)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--success)',
                        fontSize: '2.2rem',
                        fontWeight: 'bold',
                        marginBottom: '24px',
                        animation: 'scaleUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
                      }}>
                        ✓
                      </div>
                      <h4 style={{ fontFamily: 'Outfit', fontSize: '1.4rem', color: 'var(--success)', marginBottom: '8px' }}>
                        Payment Successful!
                      </h4>
                      <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                        Amount of ${finalTotal.toFixed(2)} has been secured. Task is completed!
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Live Map Panel */}
      <div id="map" ref={mapRef} className="map-container"></div>

      {/* Camera Viewfinder Modal */}
      {showCameraModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          backdropFilter: 'blur(10px)',
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div style={{
            width: '90%',
            maxWidth: '480px',
            background: 'rgba(17, 18, 25, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '24px',
            padding: '24px',
            position: 'relative',
            boxShadow: 'var(--shadow)',
            textAlign: 'center'
          }}>
            <button
              onClick={closeCamera}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>
            <h3 style={{ fontFamily: 'Outfit', fontSize: '1.25rem', marginBottom: '20px', color: 'var(--text-primary)' }}>
              Capture Photo
            </h3>

            <div style={{
              position: 'relative',
              width: '100%',
              paddingBottom: '75%', // 4:3 Aspect Ratio
              background: '#000',
              borderRadius: '16px',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.06)',
              marginBottom: '20px'
            }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)' // Mirror effect for user webcam
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', alignItems: 'center' }}>
              <button
                onClick={closeCamera}
                className="btn-secondary"
                style={{ height: '44px', padding: '0 20px', borderRadius: '12px' }}
              >
                Cancel
              </button>
              <button
                onClick={capturePhoto}
                className="btn-primary"
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 6px 20px rgba(29, 78, 216, 0.5)'
                }}
                title="Capture Frame"
              >
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  border: '3px solid #fff',
                  background: 'transparent'
                }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Viewer Modal */}
      {lightboxImage && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.92)',
            backdropFilter: 'blur(10px)',
            zIndex: 2100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            style={{
              position: 'absolute',
              top: '24px',
              right: '24px',
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              transition: 'var(--transition)'
            }}
          >
            <X size={24} />
          </button>
          <img 
            src={lightboxImage} 
            alt="Preview" 
            style={{ 
              maxWidth: '90%', 
              maxHeight: '90%', 
              objectFit: 'contain', 
              borderRadius: '8px', 
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)' 
            }} 
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}

      {/* Create Task Modal Overlay */}
      {showCreateTaskModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div className="glass-panel" style={{
            width: '90%',
            maxWidth: '500px',
            background: 'rgba(17, 18, 25, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '24px',
            padding: '32px',
            position: 'relative',
            boxShadow: 'var(--shadow)',
            animation: 'scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            <button
              onClick={() => {
                setShowCreateTaskModal(false);
                setError(null);
              }}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'var(--transition)'
              }}
              className="hover-bright"
            >
              <X size={24} />
            </button>

            <h3 style={{ fontFamily: 'Outfit', fontSize: '1.5rem', marginBottom: '8px', color: 'var(--text-primary)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📍 Post a Task (Drop Pin)
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'left', marginBottom: '24px' }}>
              Fill in the details to drop a task pin on the map. Users near this location will be able to see and offer help.
            </p>

            <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Task Title</label>
                <input
                  type="text"
                  placeholder="e.g., Walk my dog / Buy groceries"
                  className="form-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Description</label>
                <textarea
                  placeholder="Describe the task, what is needed, and any details..."
                  className="form-input"
                  style={{ minHeight: '100px', resize: 'vertical', fontFamily: 'inherit' }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255, 255, 255, 0.02)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Paid Task</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Toggle if you want to offer monetary budget</span>
                </div>
                <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px' }}>
                  <input
                    type="checkbox"
                    checked={isPaid}
                    onChange={(e) => setIsPaid(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    inset: 0,
                    backgroundColor: isPaid ? 'var(--primary)' : 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '24px',
                    transition: 'var(--transition)'
                  }}>
                    <span style={{
                      position: 'absolute',
                      content: '""',
                      height: '18px',
                      width: '18px',
                      left: isPaid ? '26px' : '3px',
                      bottom: '3px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: 'var(--transition)'
                    }} />
                  </span>
                </label>
              </div>

              {isPaid && (
                <div className="form-group" style={{ margin: 0, animation: 'fadeIn 0.2s ease-out' }}>
                  <label className="form-label">Price / Reward ($)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Enter reward amount"
                    className="form-input"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                  />
                </div>
              )}

              {/* Coordinates Indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.01)', padding: '10px 14px', borderRadius: '10px', border: '1px dashed rgba(255, 255, 255, 0.08)' }}>
                <MapPin size={14} color="var(--primary)" />
                <span>
                  Location: {latitude !== null && longitude !== null ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : 'Click on map to drop pin'}
                </span>
              </div>

              {error && (
                <div style={{ color: 'var(--danger)', fontSize: '0.85rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldAlert size={14} />
                  <span>{error}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateTaskModal(false);
                    setError(null);
                  }}
                  className="btn-secondary"
                  style={{ flex: 1, padding: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || latitude === null || longitude === null}
                  className="btn-primary"
                  style={{ flex: 1, padding: '12px' }}
                >
                  {submitting ? 'Posting...' : 'Create Pin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Simulated Payment Redirect Gateway (GPay / PhonePe) */}
      {activeRedirectGateway && activeSession && (() => {
        const basePrice = activeSession.task?.price || 0;
        const serviceFee = basePrice * 0.05;
        const discountAmount = (basePrice + serviceFee) * discount;
        const finalTotal = basePrice + serviceFee - discountAmount;
        const gatewayName = activeRedirectGateway === 'gpay' ? 'Google Pay' : 'PhonePe';
        const gatewayColor = activeRedirectGateway === 'gpay' ? '#1a73e8' : '#5f259f';
        const logoIcon = activeRedirectGateway === 'gpay' ? '📱' : '🟣';

        return (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: '#090a0f',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f8fafc',
            fontFamily: 'Outfit, sans-serif',
            animation: 'fadeIn 0.3s ease-out'
          }}>
            <div style={{
              width: '100%',
              maxWidth: '400px',
              height: '100%',
              maxHeight: '750px',
              background: '#12131a',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '24px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative'
            }}>
              {/* Header */}
              <div style={{
                background: activeRedirectGateway === 'gpay' ? 'rgba(26, 115, 232, 0.1)' : 'rgba(95, 37, 159, 0.1)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.4rem' }}>{logoIcon}</span>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
                    {gatewayName} Secure Gateway
                  </span>
                </div>
                {gatewayStep !== 'authorizing' && gatewayStep !== 'success' && (
                  <button
                    onClick={() => {
                      setGatewayStep('cancelled');
                      setTimeout(() => {
                        setActiveRedirectGateway(null);
                        setGatewayStep('idle');
                      }, 1500);
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      borderRadius: '50%',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'var(--transition)'
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Body */}
              <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                {gatewayStep === 'idle' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                    <div style={{ textAlign: 'center', marginTop: '20px' }}>
                      <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '16px',
                        background: activeRedirectGateway === 'gpay' ? 'rgba(26, 115, 232, 0.15)' : 'rgba(95, 37, 159, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '2rem',
                        margin: '0 auto 16px auto',
                        border: `1px solid ${gatewayColor}`
                      }}>
                        🔑
                      </div>
                      <h4 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>UPI Payment Request</h4>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 24px 0' }}>
                        You are paying <strong>Dogether Merchant</strong> for task: <br />
                        <span style={{ color: '#fff', fontSize: '0.9rem', display: 'block', marginTop: '4px', fontWeight: 600 }}>"{activeSession.task?.title}"</span>
                      </p>

                      {/* Details Card */}
                      <div className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px', textAlign: 'left', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Merchant:</span>
                          <span style={{ fontWeight: 600 }}>Dogether Co.</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Transaction ID:</span>
                          <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>TXN{Math.floor(Math.random() * 900000000 + 100000000)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px', marginTop: '8px' }}>
                          <span style={{ fontWeight: 700 }}>Total Amount:</span>
                          <span style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '1.15rem' }}>${finalTotal.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Bank Select */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255, 255, 255, 0.02)', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'left' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#fff', color: '#000', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>SBI</div>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block' }}>State Bank of India</span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Savings Account •••• 9876</span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>✓ Linked</span>
                      </div>
                    </div>

                    <button
                      onClick={() => setGatewayStep('pin')}
                      className="btn-primary"
                      style={{ width: '100%', padding: '14px', fontSize: '1rem', borderRadius: '14px', background: gatewayColor, boxShadow: `0 4px 14px ${gatewayColor}40` }}
                    >
                      Proceed to Pay ${finalTotal.toFixed(2)}
                    </button>
                  </div>
                )}

                {gatewayStep === 'pin' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                    <div style={{ textAlign: 'center', marginTop: '10px' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                        Enter 4-Digit UPI PIN
                      </span>
                      <h3 style={{ fontSize: '1.8rem', margin: '12px 0 6px 0', fontFamily: 'Outfit' }}>${finalTotal.toFixed(2)}</h3>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                        Paying Dogether Merchant
                      </p>

                      {/* Pin Dots */}
                      <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', margin: '36px 0' }}>
                        {[0, 1, 2, 3].map((idx) => (
                          <div
                            key={idx}
                            style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '50%',
                              background: gatewayPin.length > idx ? '#fff' : 'rgba(255,255,255,0.1)',
                              border: '2px solid rgba(255,255,255,0.2)',
                              transition: 'all 0.15s ease'
                            }}
                          />
                        ))}
                      </div>

                      {/* Keyboard Grid */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '12px',
                        maxWidth: '280px',
                        margin: '0 auto'
                      }}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => {
                              if (gatewayPin.length < 4) {
                                const newPin = gatewayPin + num;
                                setGatewayPin(newPin);
                                if (newPin.length === 4) {
                                  setTimeout(() => {
                                    handleProcessRedirectedPayment();
                                  }, 400); // small delay to show dot fill
                                }
                              }
                            }}
                            style={{
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.05)',
                              color: '#fff',
                              borderRadius: '50%',
                              width: '56px',
                              height: '56px',
                              fontSize: '1.4rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              margin: '0 auto',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'var(--transition)'
                            }}
                            className="keyboard-btn"
                          >
                            {num}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setGatewayPin('');
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--danger)',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (gatewayPin.length < 4) {
                              const newPin = gatewayPin + '0';
                              setGatewayPin(newPin);
                              if (newPin.length === 4) {
                                setTimeout(() => {
                                  handleProcessRedirectedPayment();
                                }, 400);
                              }
                            }
                          }}
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            color: '#fff',
                            borderRadius: '50%',
                            width: '56px',
                            height: '56px',
                            fontSize: '1.4rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            margin: '0 auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'var(--transition)'
                          }}
                          className="keyboard-btn"
                        >
                          0
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (gatewayPin.length > 0) {
                              setGatewayPin(gatewayPin.slice(0, -1));
                            }
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          ⌫
                        </button>
                      </div>
                    </div>

                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textAlign: 'center', marginTop: '16px' }}>
                      🔒 Powered by National Payments Corporation of India (NPCI)
                    </span>
                  </div>
                )}

                {gatewayStep === 'authorizing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center' }}>
                    <div className="payment-spinner" style={{
                      width: '56px',
                      height: '56px',
                      border: '4px solid rgba(255,255,255,0.05)',
                      borderTop: `4px solid ${gatewayColor}`,
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      marginBottom: '24px'
                    }} />
                    <h4 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>Processing UPI Payment</h4>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      Contacting your bank. Please do not close this screen or press back.
                    </p>
                  </div>
                )}

                {gatewayStep === 'success' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center', animation: 'scaleUp 0.3s ease-out' }}>
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '3px solid var(--success)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--success)',
                      fontSize: '1.8rem',
                      fontWeight: 'bold',
                      marginBottom: '20px'
                    }}>
                      ✓
                    </div>
                    <h4 style={{ fontSize: '1.3rem', color: 'var(--success)', fontWeight: 700, marginBottom: '8px' }}>Payment Approved!</h4>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      Amount of ${finalTotal.toFixed(2)} has been successfully paid. <br />
                      Redirecting back to Dogether app...
                    </p>
                  </div>
                )}

                {gatewayStep === 'cancelled' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center', animation: 'scaleUp 0.3s ease-out' }}>
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '3px solid var(--danger)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--danger)',
                      fontSize: '1.8rem',
                      fontWeight: 'bold',
                      marginBottom: '20px'
                    }}>
                      ✕
                    </div>
                    <h4 style={{ fontSize: '1.3rem', color: 'var(--danger)', fontWeight: 700, marginBottom: '8px' }}>Payment Cancelled</h4>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      The transaction was cancelled. Returning to the checkout page...
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
      {/* Real-time Message Notification Toast */}
      {activeNotification && (
        <div 
          onClick={() => {
            handleOpenSession(activeNotification.sessionId);
            setActiveTab('chats');
            setActiveNotification(null);
          }}
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1.5px solid var(--primary)',
            borderRadius: '12px',
            boxShadow: '0 12px 32px rgba(29, 78, 216, 0.25)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 99999,
            cursor: 'pointer',
            animation: 'slideIn 0.3s ease-out',
            backdropFilter: 'blur(10px)',
            maxWidth: '320px',
            minWidth: '260px'
          }}
        >
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'rgba(29, 78, 216, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.1rem',
            color: 'var(--primary)',
            flexShrink: 0
          }}>
            💬
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
              New Message
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeNotification.senderName}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>
              {activeNotification.content}
            </span>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setActiveNotification(null);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '1.1rem',
              padding: '4px',
              marginLeft: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};
export default Dashboard;
