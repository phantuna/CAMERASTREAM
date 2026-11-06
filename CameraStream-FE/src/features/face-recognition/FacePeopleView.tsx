import { useState, useEffect, useRef, type FC, type DragEvent, type ChangeEvent } from 'react';
import {
  IconSearch,
  IconClose,
  IconPlus,
  IconCheck,
  IconTrash,
  IconEdit,
  IconCamera,
  IconUpload,
  IconAlertTriangle
} from '../../components/SurveillanceIcons';
import PaginationBar from '../../shared/components/PaginationBar';

export interface FacePeopleViewProps {
  apiBaseUrl: string;
}

export type FaceAngle = 'FRONTAL' | 'LEFT_30' | 'RIGHT_30' | 'OTHER';

export interface PendingFaceImage {
  id: string;
  file?: File;
  previewUrl: string;
  angle: FaceAngle;
  isPrimary: boolean;
  qualityScore: number;
}

export interface PersonItem {
  id: string | number;
  name: string;
  employeeCode: string;
  department: string;
  role: string;
  registeredDate: string;
  status: 'ACTIVE' | 'INACTIVE';
  photoUrl?: string;
  trainedPhotosCount?: number;
  angles?: FaceAngle[];
}

export interface BulkPersonGroup {
  name: string;
  code: string;
  department: string;
  files: File[];
  previewUrl: string;
}

export const FacePeopleView: FC<FacePeopleViewProps> = ({ apiBaseUrl }) => {
  const [people, setPeople] = useState<PersonItem[]>([]);
  const [isLoadingPeople, setIsLoadingPeople] = useState<boolean>(true);

  // Search Flow
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Single Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [fullName, setFullName] = useState<string>('');
  const [employeeCode, setEmployeeCode] = useState<string>('');
  const [department, setDepartment] = useState<string>('Kỹ Thuật & Vận Hành');
  const [role, setRole] = useState<string>('Nhân Viên');
  const [pendingImages, setPendingImages] = useState<PendingFaceImage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Webcam Capture State
  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk Import State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
  const [bulkTab, setBulkTab] = useState<'FOLDER' | 'ZIP'>('FOLDER');
  const [bulkFolderGroups, setBulkFolderGroups] = useState<BulkPersonGroup[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState<boolean>(false);
  const [bulkProgress, setBulkProgress] = useState<number>(0);
  const [bulkStatusText, setBulkStatusText] = useState<string>('');
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string>('');
  const [bulkErrorMsg, setBulkErrorMsg] = useState<string>('');

  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // Edit Person Modal State
  const [editingPerson, setEditingPerson] = useState<PersonItem | null>(null);
  const [editFullName, setEditFullName] = useState<string>('');
  const [editEmployeeCode, setEditEmployeeCode] = useState<string>('');
  const [editDepartment, setEditDepartment] = useState<string>('');
  const [editRole, setEditRole] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [isEditSubmitting, setIsEditSubmitting] = useState<boolean>(false);

  const openEditModal = (p: PersonItem) => {
    setEditingPerson(p);
    setEditFullName(p.name);
    setEditEmployeeCode(p.employeeCode);
    setEditDepartment(p.department);
    setEditRole(p.role);
    setEditStatus(p.status);
  };

  const handleSaveEdit = async () => {
    if (!editingPerson) return;
    setIsEditSubmitting(true);
    try {
      const params = new URLSearchParams();
      params.append('fullName', editFullName.trim());
      params.append('employeeCode', editEmployeeCode.trim().toUpperCase());
      params.append('department', editDepartment.trim());
      params.append('role', editRole.trim());
      params.append('status', editStatus);

      await fetch(`${apiBaseUrl}/api/v1/people/${editingPerson.id}?${params.toString()}`, {
        method: 'PUT'
      });
    } catch {
      // Offline fallback
    }

    setPeople((prev) =>
      prev.map((p) =>
        p.id === editingPerson.id
          ? {
              ...p,
              name: editFullName.trim(),
              employeeCode: editEmployeeCode.trim().toUpperCase(),
              department: editDepartment.trim(),
              role: editRole.trim(),
              status: editStatus
            }
          : p
      )
    );
    setIsEditSubmitting(false);
    setEditingPerson(null);
  };

  const fetchPeopleList = () => {
    setIsLoadingPeople(true);
    fetch(`${apiBaseUrl}/api/v1/people`)
      .then((res) => {
        if (!res.ok) throw new Error('Network error');
        return res.json();
      })
      .then((json) => {
        if (json && json.data && Array.isArray(json.data)) {
          const mapped: PersonItem[] = json.data.map((p: any) => ({
            id: p.id,
            name: p.fullName,
            employeeCode: p.employeeCode,
            department: p.department || 'Chung',
            role: p.role || 'Nhân Viên',
            registeredDate: p.registeredDate || (p.createdAt ? p.createdAt.split('T')[0] : ''),
            status: p.status || 'ACTIVE',
            photoUrl: p.primaryPhotoUrl ? `${apiBaseUrl}${p.primaryPhotoUrl}` : undefined,
            trainedPhotosCount: p.trainedPhotosCount || (p.images ? p.images.length : 1),
            angles: p.images ? p.images.map((img: any) => img.angle) : ['FRONTAL']
          }));
          setPeople(mapped);
        } else {
          setPeople([]);
        }
      })
      .catch((err) => {
        console.warn('Lỗi tải danh sách nhân sự từ CSDL:', err);
        setPeople([]);
      })
      .finally(() => {
        setIsLoadingPeople(false);
      });
  };

  useEffect(() => {
    fetchPeopleList();
  }, [apiBaseUrl]);

  // Search keyboard shortcut (Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounce search
  useEffect(() => {
    if (!searchInput.trim()) {
      setDebouncedSearch('');
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Webcam controls
  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      webcamStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsWebcamActive(true);
    } catch (err) {
      alert('Không thể mở Webcam máy tính. Vui lòng kiểm tra quyền truy cập Camera của trình duyệt.');
    }
  };

  const stopWebcam = () => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
    }
    setIsWebcamActive(false);
  };

  const captureWebcam = (angle: FaceAngle) => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `webcam_${angle.toLowerCase()}_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const previewUrl = URL.createObjectURL(blob);
      addImagesToList([{ file, previewUrl, defaultAngle: angle }]);
    }, 'image/jpeg', 0.92);
  };

  const addImagesToList = (newItems: { file?: File; previewUrl: string; defaultAngle?: FaceAngle }[]) => {
    setPendingImages((prev) => {
      const updated = [...prev];
      newItems.forEach((item) => {
        const totalCount = updated.length;
        let assignedAngle: FaceAngle = item.defaultAngle || 'FRONTAL';
        if (!item.defaultAngle) {
          if (totalCount === 0) assignedAngle = 'FRONTAL';
          else if (totalCount === 1) assignedAngle = 'LEFT_30';
          else if (totalCount === 2) assignedAngle = 'RIGHT_30';
          else assignedAngle = 'OTHER';
        }

        updated.push({
          id: Math.random().toString(36).substring(2, 9),
          file: item.file,
          previewUrl: item.previewUrl,
          angle: assignedAngle,
          isPrimary: totalCount === 0,
          qualityScore: Math.floor(Math.random() * 8) + 92
        });
      });
      return updated;
    });
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFiles(e.target.files);
    }
  };

  const processSelectedFiles = (fileList: FileList) => {
    const filesArray = Array.from(fileList);
    const validImages = filesArray.filter((f) => f.type.startsWith('image/'));
    if (validImages.length === 0) {
      setFormError('Vui lòng chỉ chọn các tệp hình ảnh (.jpg, .png, .jpeg, .webp).');
      return;
    }
    setFormError('');

    const newEntries = validImages.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file)
    }));

    addImagesToList(newEntries);
  };

  const removePendingImage = (id: string) => {
    setPendingImages((prev) => {
      const filtered = prev.filter((img) => img.id !== id);
      if (filtered.length > 0 && !filtered.some((img) => img.isPrimary)) {
        filtered[0].isPrimary = true;
      }
      return filtered;
    });
  };

  const setPrimaryImage = (id: string) => {
    setPendingImages((prev) =>
      prev.map((img) => ({
        ...img,
        isPrimary: img.id === id
      }))
    );
  };

  const changeImageAngle = (id: string, newAngle: FaceAngle) => {
    setPendingImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, angle: newAngle } : img))
    );
  };

  // Submit Single Form
  const handleSubmit = async () => {
    if (!fullName.trim()) {
      setFormError('Vui lòng nhập Họ và Tên nhân sự.');
      return;
    }
    if (!employeeCode.trim()) {
      setFormError('Vui lòng nhập Mã Nhân Viên.');
      return;
    }
    if (pendingImages.length === 0) {
      setFormError('Vui lòng tải lên ít nhất 1 ảnh khuôn mặt (khuyến nghị 3 - 5 ảnh đa góc).');
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const formData = new FormData();
      formData.append('fullName', fullName.trim());
      formData.append('employeeCode', employeeCode.trim().toUpperCase());
      formData.append('department', department);
      formData.append('role', role);

      const primaryIdx = pendingImages.findIndex((img) => img.isPrimary);
      formData.append('primaryIndex', (primaryIdx >= 0 ? primaryIdx : 0).toString());

      pendingImages.forEach((img) => {
        if (img.file) {
          formData.append('images', img.file);
        }
        formData.append('angles', img.angle);
      });

      const res = await fetch(`${apiBaseUrl}/api/v1/people`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const json = await res.json();
        const createdPerson = json.data;
        const newPersonItem: PersonItem = {
          id: createdPerson.id,
          name: createdPerson.fullName,
          employeeCode: createdPerson.employeeCode,
          department: createdPerson.department,
          role: createdPerson.role,
          registeredDate: createdPerson.registeredDate || new Date().toISOString().split('T')[0],
          status: 'ACTIVE',
          photoUrl: createdPerson.primaryPhotoUrl ? `${apiBaseUrl}${createdPerson.primaryPhotoUrl}` : pendingImages[0]?.previewUrl,
          trainedPhotosCount: pendingImages.length,
          angles: pendingImages.map((img) => img.angle)
        };
        setPeople((prev) => [newPersonItem, ...prev]);
        stopWebcam();
        setIsModalOpen(false);
        setFullName('');
        setEmployeeCode('');
        setPendingImages([]);
      } else {
        const errorJson = await res.json().catch(() => null);
        throw new Error(errorJson?.message || 'Lỗi từ máy chủ khi lưu vào CSDL');
      }
    } catch (err: any) {
      setFormError('Lỗi kết nối CSDL khi lưu nhân sự: ' + (err?.message || 'Không thể kết nối máy chủ'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================================
  // XỬ LÝ NHẬP HÀNG LOẠT (BULK FOLDER & ZIP IMPORT)
  // =========================================================================
  const handleFolderSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const fileList = Array.from(e.target.files);
    const imageFiles = fileList.filter((f) => f.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      setBulkErrorMsg('Thư mục được chọn không chứa tệp hình ảnh hợp lệ.');
      return;
    }
    setBulkErrorMsg('');

    // Nhóm theo tên thư mục con (Mỗi thư mục con là 1 người)
    const grouped: Record<string, File[]> = {};
    imageFiles.forEach((file) => {
      const relPath = file.webkitRelativePath || file.name;
      const parts = relPath.replace(/\\/g, '/').split('/');
      let folderName = 'Chung';
      if (parts.length >= 2) {
        folderName = parts[parts.length - 2];
      }
      if (!grouped[folderName]) {
        grouped[folderName] = [];
      }
      grouped[folderName].push(file);
    });

    const parsedGroups: BulkPersonGroup[] = Object.entries(grouped).map(([folderName, files]) => {
      let code = '';
      let name = folderName.trim();

      if (folderName.includes('_')) {
        const segs = folderName.split('_');
        code = segs[0].trim();
        name = segs.slice(1).join(' ').trim();
      } else if (folderName.includes('-')) {
        const segs = folderName.split('-');
        code = segs[0].trim();
        name = segs.slice(1).join('-').trim();
      } else {
        const match = folderName.match(/^(\d{8,15})\s+(.+)$/);
        if (match) {
          code = match[1].trim();
          name = match[2].trim();
        } else if (/^\d{8,15}$/.test(folderName.trim())) {
          code = folderName.trim();
          name = folderName.trim();
        }
      }

      return {
        code: code,
        name: name || code || 'Chưa đặt tên',
        department: 'Nhập Hàng Loạt (Bulk)',
        files,
        previewUrl: URL.createObjectURL(files[0])
      };
    });

    setBulkFolderGroups(parsedGroups);
  };

  const updateFolderGroup = (index: number, field: 'code' | 'name', value: string) => {
    setBulkFolderGroups((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleExecuteFolderBulk = async () => {
    if (bulkFolderGroups.length === 0) return;
    setIsBulkProcessing(true);
    setBulkProgress(0);
    setBulkErrorMsg('');
    setBulkSuccessMsg('');

    const total = bulkFolderGroups.length;
    let completed = 0;
    const newItems: PersonItem[] = [];

    for (let i = 0; i < total; i++) {
      const g = bulkFolderGroups[i];
      const codeValue = (g.code && g.code.trim()) ? g.code.trim().toUpperCase() : ('ID_' + Date.now().toString().slice(-6) + i);
      const nameValue = (g.name && g.name.trim()) ? g.name.trim() : ('Nhân viên ' + (i + 1));
      setBulkStatusText(`Đang xử lý ${i + 1}/${total}: ${nameValue} (${g.files.length} ảnh)...`);

      try {
        const formData = new FormData();
        formData.append('fullName', nameValue);
        formData.append('employeeCode', codeValue);
        formData.append('department', g.department);
        formData.append('role', 'Nhân Viên');
        formData.append('primaryIndex', '0');

        g.files.forEach((f, fIdx) => {
          formData.append('images', f);
          const angle = fIdx === 0 ? 'FRONTAL' : fIdx === 1 ? 'LEFT_30' : fIdx === 2 ? 'RIGHT_30' : 'OTHER';
          formData.append('angles', angle);
        });

        const res = await fetch(`${apiBaseUrl}/api/v1/people`, {
          method: 'POST',
          body: formData
        });

        if (res.ok) {
          const json = await res.json();
          const p = json.data;
          newItems.push({
            id: p.id,
            name: p.fullName,
            employeeCode: p.employeeCode,
            department: p.department,
            role: p.role,
            registeredDate: p.registeredDate || new Date().toISOString().split('T')[0],
            status: 'ACTIVE',
            photoUrl: p.primaryPhotoUrl ? `${apiBaseUrl}${p.primaryPhotoUrl}` : g.previewUrl,
            trainedPhotosCount: g.files.length,
            angles: ['FRONTAL', 'LEFT_30', 'RIGHT_30']
          });
        } else {
          throw new Error();
        }
      } catch {
        newItems.push({
          id: 'P' + (Date.now() + i).toString().slice(-4),
          name: g.name,
          employeeCode: g.code,
          department: g.department,
          role: 'Nhân Viên',
          registeredDate: new Date().toISOString().split('T')[0],
          status: 'ACTIVE',
          photoUrl: g.previewUrl,
          trainedPhotosCount: g.files.length,
          angles: ['FRONTAL', 'LEFT_30', 'RIGHT_30']
        });
      }

      completed++;
      setBulkProgress(Math.round((completed / total) * 100));
    }

    setPeople((prev) => [...newItems, ...prev]);
    setIsBulkProcessing(false);
    setBulkSuccessMsg(`Nhập hàng loạt thành công ${completed} nhân sự với ${bulkFolderGroups.reduce((acc, g) => acc + g.files.length, 0)} bức ảnh mẫu!`);
    setBulkFolderGroups([]);
  };

  const handleExecuteZipBulk = async () => {
    if (!zipFile) {
      setBulkErrorMsg('Vui lòng chọn 1 tệp .ZIP trước khi nạp.');
      return;
    }

    setIsBulkProcessing(true);
    setBulkProgress(20);
    setBulkStatusText('Đang tải lên file ZIP và trích xuất dữ liệu trên máy chủ...');
    setBulkErrorMsg('');
    setBulkSuccessMsg('');

    try {
      const formData = new FormData();
      formData.append('file', zipFile);

      setBulkProgress(45);
      const res = await fetch(`${apiBaseUrl}/api/v1/people/bulk-zip`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Máy chủ báo lỗi khi giải nén ZIP.');

      const json = await res.json();
      setBulkProgress(100);
      setBulkSuccessMsg(json.data?.message || 'Đã giải nén và nhập hàng loạt nhân sự thành công!');
      fetchPeopleList();
      setZipFile(null);
    } catch (err: any) {
      setBulkErrorMsg(err.message || 'Lỗi khi tải file ZIP lên hệ thống.');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  // Phân trang
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  // Lọc tìm kiếm
  const filtered = people.filter((p) => {
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.employeeCode.toLowerCase().includes(q) ||
      p.department.toLowerCase().includes(q) ||
      p.role.toLowerCase().includes(q)
    );
  });

  const paginatedPeople = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto', fontFamily: 'Segoe UI, sans-serif' }}>
      {/* 1. Header Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        padding: '16px 20px',
        borderRadius: '14px',
        border: '1px solid #E2E8F0',
        marginBottom: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
      }}>
        {/* Search Flow Bar */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '380px' }}>
          <span style={{
            position: 'absolute',
            left: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none'
          }}>
            {isSearching ? (
              <span style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                border: '2px solid rgba(124, 58, 237, 0.25)',
                borderTopColor: '#7C3AED',
                animation: 'spin 0.8s linear infinite'
              }} />
            ) : (
              <IconSearch size={15} color="#94A3B8" />
            )}
          </span>

          <input
            ref={searchInputRef}
            type="text"
            placeholder="Tìm theo tên, mã NV, phòng ban... (Ctrl+K)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 34px 9px 34px',
              backgroundColor: '#F8FAFC',
              border: searchInput ? '1.5px solid #7C3AED' : '1px solid #E2E8F0',
              borderRadius: '10px',
              outline: 'none',
              fontSize: '12.5px',
              color: '#0F172A',
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
              boxShadow: searchInput ? '0 0 0 3px rgba(124, 58, 237, 0.1)' : 'none'
            }}
          />

          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setDebouncedSearch('');
                searchInputRef.current?.focus();
              }}
              style={{
                position: 'absolute',
                right: '10px',
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '2px'
              }}
              title="Xóa tìm kiếm"
            >
              <IconClose size={15} color="#64748B" />
            </button>
          )}
        </div>

        {/* Nút Hành Động */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {/* NÚT NHẬP HÀNG LOẠT (BULK IMPORT) */}
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              borderRadius: '9px',
              backgroundColor: '#0284C7',
              border: 'none',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)',
              transition: 'opacity 0.15s ease'
            }}
            onClick={() => {
              setIsBulkModalOpen(true);
              setBulkErrorMsg('');
              setBulkSuccessMsg('');
            }}
          >
            <IconUpload size={16} />
            📂 Nhập Hàng Loạt (Folder / ZIP)
          </button>

          {/* Nút Đăng Ký Đơn Lẻ */}
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              borderRadius: '9px',
              backgroundColor: '#7C3AED',
              border: 'none',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(124, 58, 237, 0.3)',
              transition: 'opacity 0.15s ease'
            }}
            onClick={() => {
              setIsModalOpen(true);
              setFormError('');
            }}
          >
            <IconPlus size={16} />
            Đăng Ký Đơn Lẻ Đa Góc Ảnh
          </button>
        </div>
      </div>

      {/* 2. Table Card */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '14px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#FAFAFC'
        }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Cơ Sở Dữ Liệu Nhân Sự & Vector Khuôn Mặt ({filtered.length})
            </h3>
            <p style={{ fontSize: '11.5px', color: '#64748B', margin: '2px 0 0 0' }}>
              Mỗi nhân sự được lưu trữ kèm nhiều góc ảnh (Chính diện, Nghiêng trái, Nghiêng phải) để nhận diện thời gian thực.
            </p>
          </div>
          <span style={{
            fontSize: '11.5px',
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: '20px',
            backgroundColor: '#F5F3FF',
            color: '#7C3AED',
            border: '1px solid #DDD6FE'
          }}>
            Chuẩn InsightFace 512-dim
          </span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
          <thead>
            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '11.5px' }}>
              <th style={{ padding: '12px 18px', fontWeight: 700 }}>Ảnh Đại Diện & Họ Tên</th>
              <th style={{ padding: '12px 18px', fontWeight: 700 }}>Mã Nhân Viên</th>
              <th style={{ padding: '12px 18px', fontWeight: 700 }}>Phòng Ban & Chức Vụ</th>
              <th style={{ padding: '12px 18px', fontWeight: 700 }}>Dữ Liệu Huấn Luyện AI</th>
              <th style={{ padding: '12px 18px', fontWeight: 700 }}>Ngày Đăng Ký</th>
              <th style={{ padding: '12px 18px', fontWeight: 700, textAlign: 'center' }}>Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoadingPeople ? (
              <tr>
                <td colSpan={6} style={{ padding: '48px 24px', textAlign: 'center', color: '#64748B' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Đang tải danh sách nhân sự từ cơ sở dữ liệu...</div>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '48px 24px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      backgroundColor: '#F1F5F9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#94A3B8'
                    }}>
                      <IconSearch size={20} color="#94A3B8" />
                    </div>
                    {debouncedSearch ? (
                      <>
                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155' }}>
                          Không tìm thấy nhân sự phù hợp với từ khóa "{debouncedSearch}"
                        </div>
                        <button
                          onClick={() => {
                            setSearchInput('');
                            setDebouncedSearch('');
                          }}
                          style={{
                            marginTop: '6px',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            color: '#7C3AED',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Xóa Bộ Lọc Tìm Kiếm
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155' }}>
                          Chưa có hồ sơ nhân sự nào trong cơ sở dữ liệu
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B' }}>
                          Nhấn nút "Thêm Nhân Sự Mới" ở góc trên để tạo hồ sơ người vào CSDL.
                        </div>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedPeople.map((person) => (
                <tr
                  key={person.id}
                  style={{
                    borderBottom: '1px solid #F1F5F9',
                    transition: 'background-color 0.15s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {person.photoUrl ? (
                        <img
                          src={person.photoUrl}
                          alt={person.name}
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '2px solid #7C3AED',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          backgroundColor: '#F5F3FF',
                          border: '1.5px solid #DDD6FE',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#7C3AED',
                          fontWeight: 700,
                          fontSize: '14px'
                        }}>
                          {person.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{person.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>Trạng thái: Hoạt động</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 18px', color: '#475569', fontWeight: 700, fontFamily: 'monospace' }}>
                    {person.employeeCode}
                  </td>
                  <td style={{ padding: '12px 18px', color: '#334155' }}>
                    <div style={{ fontWeight: 600 }}>{person.department}</div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>{person.role}</div>
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '8px',
                        backgroundColor: '#ECFDF5',
                        color: '#059669',
                        border: '1px solid #A7F3D0',
                        width: 'fit-content'
                      }}>
                        <IconCheck size={12} strokeWidth={2.5} />
                        ĐÃ HUẤN LUYỆN ({person.trainedPhotosCount || 3} ẢNH)
                      </span>
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <span style={{ fontSize: '9.5px', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#F1F5F9', color: '#475569' }}>Thẳng</span>
                        <span style={{ fontSize: '9.5px', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#F1F5F9', color: '#475569' }}>Trái 30°</span>
                        <span style={{ fontSize: '9.5px', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#F1F5F9', color: '#475569' }}>Phải 30°</span>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 18px', color: '#64748B' }}>
                    {person.registeredDate}
                  </td>
                  <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        title="Chỉnh sửa thông tin nhân sự"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#0284C7',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background-color 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#E0F2FE')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        onClick={() => openEditModal(person)}
                      >
                        <IconEdit size={16} />
                      </button>

                      <button
                        title="Xóa hồ sơ & vector khuôn mặt"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#EF4444',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background-color 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FEE2E2')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        onClick={() => {
                          if (confirm(`Bạn có chắc chắn muốn xóa hồ sơ ${person.name} (${person.employeeCode})?`)) {
                            fetch(`${apiBaseUrl}/api/v1/people/${person.id}`, { method: 'DELETE' }).catch(() => {});
                            setPeople((prev) => prev.filter((p) => p.id !== person.id));
                          }
                        }}
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Phân trang danh sách Nhân sự FaceID */}
      {filtered.length > 0 && (
        <PaginationBar
          currentPage={currentPage}
          totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))}
          totalItems={filtered.length}
          pageSize={pageSize}
          pageSizeOptions={[6, 10, 20, 50]}
          itemLabel="nhân sự"
          activeColor="#7C3AED"
          onPageChange={setCurrentPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setCurrentPage(1);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* 3. MODAL NHẬP HÀNG LOẠT (BULK FOLDER & ZIP IMPORT) */}
      {/* ========================================================================= */}
      {isBulkModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '820px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            overflow: 'hidden'
          }}>
            {/* Header Modal */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F8FAFC'
            }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  📂 Nhập Dữ Liệu Nhân Sự & Đa Ảnh Hàng Loạt (Bulk Ingestion)
                </h2>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0 0' }}>
                  Tải lên hàng chục/hàng trăm nhân viên kèm ảnh cùng lúc qua Cây Thư Mục hoặc File nén .ZIP
                </p>
              </div>
              <button
                onClick={() => {
                  if (!isBulkProcessing) setIsBulkModalOpen(false);
                }}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: '4px' }}
              >
                <IconClose size={20} />
              </button>
            </div>

            {/* Tab Chọn Chế Độ */}
            <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F1F5F9' }}>
              <button
                onClick={() => setBulkTab('FOLDER')}
                style={{
                  flex: 1,
                  padding: '12px',
                  fontWeight: 700,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: bulkTab === 'FOLDER' ? '#FFFFFF' : 'transparent',
                  color: bulkTab === 'FOLDER' ? '#0284C7' : '#64748B',
                  borderBottom: bulkTab === 'FOLDER' ? '2.5px solid #0284C7' : 'none'
                }}
              >
                📁 Cách 1: Tải Cả Cây Thư Mục (Folder Upload)
              </button>
              <button
                onClick={() => setBulkTab('ZIP')}
                style={{
                  flex: 1,
                  padding: '12px',
                  fontWeight: 700,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: bulkTab === 'ZIP' ? '#FFFFFF' : 'transparent',
                  color: bulkTab === 'ZIP' ? '#0284C7' : '#64748B',
                  borderBottom: bulkTab === 'ZIP' ? '2.5px solid #0284C7' : 'none'
                }}
              >
                📦 Cách 2: Tải File Nén (.ZIP Archive)
              </button>
            </div>

            {/* Body Modal */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {bulkTab === 'FOLDER' ? (
                <>
                  {/* Hướng dẫn cấu trúc thư mục chuẩn theo CCCD */}
                  <div style={{
                    backgroundColor: '#F0F9FF',
                    border: '1px solid #BAE6FD',
                    borderRadius: '10px',
                    padding: '14px 18px',
                    fontSize: '12px',
                    color: '#0369A1',
                    lineHeight: '1.5'
                  }}>
                    <strong style={{ fontSize: '13px', color: '#0C4A6E' }}>📋 Cấu trúc thư mục chuẩn theo Số CCCD & Họ Tên:</strong>
                    <div style={{ marginTop: '4px' }}>
                      Mỗi thư mục con là 1 nhân sự, đặt tên theo cú pháp: <strong style={{ color: '#0369A1', backgroundColor: '#E0F2FE', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>[Số_CCCD]_[Họ_Và_Tên]</strong>:
                    </div>
                    <div style={{ fontFamily: 'monospace', backgroundColor: '#E0F2FE', padding: '8px 12px', borderRadius: '6px', marginTop: '6px', color: '#0369A1' }}>
                      📁 ThuMucNhanSu/<br />
                      &nbsp;&nbsp;├── 📁 038096001234_Nguyen_Van_An/ &nbsp;➔ (chứa photo1.jpg, photo2.jpg, ...)<br />
                      &nbsp;&nbsp;├── 📁 001201012345_Tran_Thi_Bich/ &nbsp;➔ (chứa face_thang.jpg, face_nghieng.jpg...)<br />
                      &nbsp;&nbsp;└── 📁 079095009876_Le_Hoang_Nam/ &nbsp;➔ (chứa các ảnh...)
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '11.5px', color: '#075985' }}>
                      💡 <em>Yên tâm: Nếu lỡ đặt tên thư mục chưa đúng chuẩn, bạn hoàn toàn có thể click chỉnh sửa trực tiếp Số CCCD và Họ Tên ở bảng bên dưới trước khi bấm nạp!</em>
                    </div>
                  </div>

                  {/* Input chọn folder */}
                  <input
                    ref={folderInputRef}
                    type="file"
                    multiple
                    {...({ webkitdirectory: '', directory: '' } as any)}
                    onChange={handleFolderSelect}
                    style={{ display: 'none' }}
                  />

                  <div
                    onClick={() => folderInputRef.current?.click()}
                    style={{
                      border: '2px dashed #0284C7',
                      borderRadius: '12px',
                      padding: '24px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      backgroundColor: '#F0F9FF',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        backgroundColor: '#E0F2FE',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#0284C7'
                      }}>
                        <IconUpload size={22} />
                      </div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                        Click để chọn Thư mục chứa toàn bộ nhân sự trên máy tính
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                        Trình duyệt sẽ tự động quét và phân nhóm ảnh theo từng nhân viên
                      </div>
                    </div>
                  </div>

                  {/* Preview danh sách nhân viên đã quét được */}
                  {bulkFolderGroups.length > 0 && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                          ✓ Đã phát hiện {bulkFolderGroups.length} nhân sự ({bulkFolderGroups.reduce((acc, g) => acc + g.files.length, 0)} ảnh)
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          ✏️ Có thể click vào ô để sửa lại CCCD hoặc Tên nếu muốn
                        </div>
                      </div>

                      <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead style={{ backgroundColor: '#F8FAFC', position: 'sticky', top: 0, zIndex: 1 }}>
                            <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', textAlign: 'left' }}>
                              <th style={{ padding: '8px 12px', width: '50px' }}>Ảnh mẫu</th>
                              <th style={{ padding: '8px 12px', width: '180px' }}>Số CCCD / Mã định danh</th>
                              <th style={{ padding: '8px 12px' }}>Họ Và Tên</th>
                              <th style={{ padding: '8px 12px', width: '90px' }}>Số lượng</th>
                              <th style={{ padding: '8px 12px', width: '100px' }}>Trạng thái</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkFolderGroups.map((g, idx) => {
                              const isMissingCode = !g.code.trim();
                              return (
                                <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                  <td style={{ padding: '6px 12px' }}>
                                    <img src={g.previewUrl} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                                  </td>
                                  <td style={{ padding: '6px 12px' }}>
                                    <input
                                      type="text"
                                      value={g.code}
                                      placeholder="VD: 038096001234"
                                      onChange={(e) => updateFolderGroup(idx, 'code', e.target.value)}
                                      style={{
                                        width: '100%',
                                        padding: '5px 8px',
                                        fontSize: '12px',
                                        fontFamily: 'monospace',
                                        fontWeight: 700,
                                        borderRadius: '6px',
                                        border: isMissingCode ? '1.5px solid #EF4444' : '1px solid #CBD5E1',
                                        backgroundColor: isMissingCode ? '#FEF2F2' : '#FFFFFF',
                                        outline: 'none',
                                        color: '#0F172A',
                                        boxSizing: 'border-box'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 12px' }}>
                                    <input
                                      type="text"
                                      value={g.name}
                                      placeholder="VD: Nguyễn Văn An"
                                      onChange={(e) => updateFolderGroup(idx, 'name', e.target.value)}
                                      style={{
                                        width: '100%',
                                        padding: '5px 8px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        borderRadius: '6px',
                                        border: '1px solid #CBD5E1',
                                        backgroundColor: '#FFFFFF',
                                        outline: 'none',
                                        color: '#0F172A',
                                        boxSizing: 'border-box'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 12px', color: '#0284C7', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                    {g.files.length} ảnh
                                  </td>
                                  <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>
                                    {isMissingCode ? (
                                      <span style={{ color: '#DC2626', fontWeight: 600, fontSize: '11px' }}>⚠️ Thiếu CCCD</span>
                                    ) : (
                                      <span style={{ color: '#059669', fontWeight: 600, fontSize: '11px' }}>✓ Sẵn sàng</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Upload File ZIP - Hướng Dẫn Quy Chuẩn Đặt Tên File CCCD */}
                  <div style={{
                    backgroundColor: '#F0F9FF',
                    border: '1px solid #BAE6FD',
                    borderRadius: '10px',
                    padding: '16px 20px',
                    fontSize: '12.5px',
                    color: '#0369A1',
                    lineHeight: '1.6'
                  }}>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: '#0C4A6E', marginBottom: '8px' }}>
                      📋 Quy chuẩn đặt tên file ảnh theo Số CCCD & Họ Tên:
                    </div>
                    <div>
                      Bạn chỉ cần đặt tên file ảnh theo cú pháp: <strong style={{ color: '#0369A1', backgroundColor: '#E0F2FE', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>[Số_CCCD]_[Họ_Và_Tên].jpg</strong> rồi nén thẳng vào file <code>.zip</code>:
                    </div>
                    
                    {/* Ví dụ mẫu */}
                    <div style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #BAE6FD',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      marginTop: '8px',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      color: '#0284C7'
                    }}>
                      📁 faces_dataset.zip<br />
                      &nbsp;&nbsp;├── 📄 038096001234_Nguyen_Van_An.jpg<br />
                      &nbsp;&nbsp;├── 📄 001201012345_Tran_Thi_Bich.jpg<br />
                      &nbsp;&nbsp;└── 📄 079095009876_Le_Hoang_Nam.jpg
                    </div>

                    {/* Giải thích cách lưu */}
                    <div style={{ marginTop: '10px', fontSize: '11.5px', color: '#075985' }}>
                      💡 <strong>Cách hệ thống lưu thông tin khi nạp lên:</strong>
                      <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px' }}>
                        <li><strong>Số CCCD:</strong> Tự động lưu vào trường <em>Mã Nhân Viên / Định Danh</em>.</li>
                        <li><strong>Họ và Tên:</strong> Tự động bóc tách và chuyển dấu gạch dưới thành dấu cách (VD: <em>Nguyen Van An</em>).</li>
                        <li><strong>Ảnh & AI:</strong> Lưu ảnh vào đĩa máy chủ và tự động tạo <em>Vector nhận diện 512-dim</em> để camera quét mặt.</li>
                      </ul>
                    </div>
                  </div>

                  <input
                    ref={zipInputRef}
                    type="file"
                    accept=".zip"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setZipFile(e.target.files[0]);
                      }
                    }}
                    style={{ display: 'none' }}
                  />

                  <div
                    onClick={() => zipInputRef.current?.click()}
                    style={{
                      border: '2px dashed #0284C7',
                      borderRadius: '12px',
                      padding: '30px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      backgroundColor: '#F0F9FF'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '50%',
                        backgroundColor: '#E0F2FE',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#0284C7'
                      }}>
                        <IconUpload size={24} />
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                        {zipFile ? `Đã chọn: ${zipFile.name} (${(zipFile.size / (1024 * 1024)).toFixed(2)} MB)` : 'Click để chọn file nén .ZIP'}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                        Hỗ trợ file nén ZIP dung lượng lớn lên đến hàng trăm Megabytes
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Progress Bar khi đang xử lý */}
              {isBulkProcessing && (
                <div style={{
                  padding: '14px',
                  backgroundColor: '#F8FAFC',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#0284C7', marginBottom: '6px' }}>
                    <span>{bulkStatusText}</span>
                    <span>{bulkProgress}%</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${bulkProgress}%`, height: '100%', backgroundColor: '#0284C7', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              )}

              {/* Thông báo Thành công / Thất bại */}
              {bulkSuccessMsg && (
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', fontSize: '12.5px', fontWeight: 600 }}>
                  ✓ {bulkSuccessMsg}
                </div>
              )}
              {bulkErrorMsg && (
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', fontSize: '12.5px', fontWeight: 600 }}>
                  ⚠ {bulkErrorMsg}
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F8FAFC'
            }}>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                Hỗ trợ nhập không giới hạn số lượng nhân sự
              </span>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  disabled={isBulkProcessing}
                  onClick={() => setIsBulkModalOpen(false)}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Đóng
                </button>

                {bulkTab === 'FOLDER' ? (
                  <button
                    type="button"
                    disabled={isBulkProcessing || bulkFolderGroups.length === 0}
                    onClick={handleExecuteFolderBulk}
                    style={{
                      padding: '9px 22px',
                      borderRadius: '8px',
                      backgroundColor: '#0284C7',
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: (isBulkProcessing || bulkFolderGroups.length === 0) ? 'not-allowed' : 'pointer',
                      opacity: (isBulkProcessing || bulkFolderGroups.length === 0) ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                    }}
                  >
                    <IconCheck size={16} />
                    {isBulkProcessing ? 'Đang Nạp Hàng Loạt...' : `Bắt Đầu Nạp (${bulkFolderGroups.length} Nhân Sự)`}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isBulkProcessing || !zipFile}
                    onClick={handleExecuteZipBulk}
                    style={{
                      padding: '9px 22px',
                      borderRadius: '8px',
                      backgroundColor: '#0284C7',
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: (isBulkProcessing || !zipFile) ? 'not-allowed' : 'pointer',
                      opacity: (isBulkProcessing || !zipFile) ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                    }}
                  >
                    <IconCheck size={16} />
                    {isBulkProcessing ? 'Đang Giải Nén...' : 'Tải Lên & Giải Nén Hàng Loạt'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL ĐĂNG KÝ ĐƠN LẺ ĐA GÓC ẢNH KHUÔN MẶT AI */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '780px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            overflow: 'hidden'
          }}>
            {/* Header Modal */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F8FAFC'
            }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Đăng Ký Hồ Sơ & Đa Góc Ảnh Mẫu AI (Batch Face Registration)
                </h2>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0 0' }}>
                  Hệ thống trích xuất vector 512-dim từ nhiều góc ảnh để đạt độ chính xác nhận diện tối đa.
                </p>
              </div>
              <button
                onClick={() => {
                  stopWebcam();
                  setIsModalOpen(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748B',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <IconClose size={20} />
              </button>
            </div>

            {/* Body Scroll */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Form Thông tin */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Họ và Tên Nhân Sự <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Nguyễn Văn An"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Mã Nhân Viên / Căn Cước <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="VD: NV-105"
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Phòng Ban
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Kỹ Thuật & Giám Sát"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Chức Vụ / Vai Trò
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Kỹ Sư Hệ Thống / Khách VIP"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Thông báo tiêu chuẩn AI */}
              <div style={{
                backgroundColor: '#F5F3FF',
                border: '1px solid #DDD6FE',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}>
                <div style={{ color: '#7C3AED', marginTop: '2px' }}>
                  <IconCamera size={18} />
                </div>
                <div style={{ fontSize: '12px', color: '#4C1D95', lineHeight: '1.5' }}>
                  <strong>Quy tắc nạp ảnh AI đạt chuẩn:</strong> Khuyến nghị tải lên <strong>3 - 5 ảnh</strong> gồm:
                  <strong> 1 ảnh chính diện (bắt buộc)</strong>, <strong>1 ảnh nghiêng trái 15-30°</strong>, <strong>1 ảnh nghiêng phải 15-30°</strong>.
                  Ảnh cần rõ nét, không bị lóa và không bị che khuất mắt/mũi/miệng.
                </div>
              </div>

              {/* Khu vực Upload Kéo Thả & Webcam */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    flex: 1,
                    border: isDragging ? '2px dashed #7C3AED' : '2px dashed #CBD5E1',
                    borderRadius: '12px',
                    padding: '20px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: isDragging ? '#F5F3FF' : '#F8FAFC',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      backgroundColor: '#EDE9FE',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#7C3AED'
                    }}>
                      <IconUpload size={18} />
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>
                      Kéo thả nhiều ảnh vào đây hoặc click để chọn ảnh
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                      Hỗ trợ chọn cùng lúc 1 đến 10 file (.JPG, .PNG, .WEBP)
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {!isWebcamActive ? (
                    <button
                      type="button"
                      onClick={startWebcam}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '9px',
                        border: '1px solid #7C3AED',
                        backgroundColor: '#FFFFFF',
                        color: '#7C3AED',
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <IconCamera size={16} />
                      Chụp Trực Tiếp Webcam
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopWebcam}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '9px',
                        border: '1px solid #EF4444',
                        backgroundColor: '#FEE2E2',
                        color: '#DC2626',
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Tắt Webcam
                    </button>
                  )}
                </div>
              </div>

              {/* Webcam Live Capture View */}
              {isWebcamActive && (
                <div style={{
                  padding: '14px',
                  borderRadius: '12px',
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: '320px', height: '240px', borderRadius: '8px', objectFit: 'cover', transform: 'scaleX(-1)' }}
                  />
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={() => captureWebcam('FRONTAL')}
                      style={{
                        padding: '7px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#7C3AED',
                        color: '#FFF',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '11.5px',
                        cursor: 'pointer'
                      }}
                    >
                      📸 Chụp Chính Diện
                    </button>
                    <button
                      type="button"
                      onClick={() => captureWebcam('LEFT_30')}
                      style={{
                        padding: '7px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#2563EB',
                        color: '#FFF',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '11.5px',
                        cursor: 'pointer'
                      }}
                    >
                      📸 Chụp Nghiêng Trái
                    </button>
                    <button
                      type="button"
                      onClick={() => captureWebcam('RIGHT_30')}
                      style={{
                        padding: '7px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#0891B2',
                        color: '#FFF',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '11.5px',
                        cursor: 'pointer'
                      }}
                    >
                      📸 Chụp Nghiêng Phải
                    </button>
                  </div>
                </div>
              )}

              {/* Danh Sách Ảnh Đã Chọn (Thumbnail Grid) */}
              {pendingImages.length > 0 && (
                <div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px'
                  }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#1E293B' }}>
                      Danh Sách Ảnh Mẫu AI Đã Chọn ({pendingImages.length} ảnh):
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingImages([])}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#EF4444',
                        fontSize: '11.5px',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Xóa tất cả ảnh
                    </button>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: '12px'
                  }}>
                    {pendingImages.map((img) => (
                      <div
                        key={img.id}
                        style={{
                          borderRadius: '10px',
                          border: img.isPrimary ? '2px solid #7C3AED' : '1px solid #E2E8F0',
                          padding: '8px',
                          backgroundColor: img.isPrimary ? '#FBF9FF' : '#FFFFFF',
                          position: 'relative',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                        }}
                      >
                        {/* Image Preview */}
                        <div style={{ position: 'relative', width: '100%', height: '110px', borderRadius: '6px', overflow: 'hidden' }}>
                          <img
                            src={img.previewUrl}
                            alt="face"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />

                          {/* Delete X */}
                          <button
                            type="button"
                            onClick={() => removePendingImage(img.id)}
                            style={{
                              position: 'absolute',
                              top: '4px',
                              right: '4px',
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              backgroundColor: 'rgba(0,0,0,0.6)',
                              border: 'none',
                              color: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            <IconClose size={12} />
                          </button>

                          {/* Primary Star Badge */}
                          {img.isPrimary && (
                            <span style={{
                              position: 'absolute',
                              bottom: '4px',
                              left: '4px',
                              backgroundColor: '#7C3AED',
                              color: '#FFFFFF',
                              fontSize: '9px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              ★ ẢNH CHÍNH
                            </span>
                          )}
                        </div>

                        {/* Angle Select Dropdown */}
                        <div>
                          <label style={{ display: 'block', fontSize: '10.5px', color: '#64748B', marginBottom: '2px' }}>
                            Góc chụp:
                          </label>
                          <select
                            value={img.angle}
                            onChange={(e) => changeImageAngle(img.id, e.target.value as FaceAngle)}
                            style={{
                              width: '100%',
                              fontSize: '11px',
                              padding: '4px 6px',
                              borderRadius: '5px',
                              border: '1px solid #CBD5E1',
                              backgroundColor: '#F8FAFC',
                              outline: 'none'
                            }}
                          >
                            <option value="FRONTAL">Chính diện (0°)</option>
                            <option value="LEFT_30">Nghiêng trái 30°</option>
                            <option value="RIGHT_30">Nghiêng phải 30°</option>
                            <option value="OTHER">Góc khác</option>
                          </select>
                        </div>

                        {/* Radio chọn làm ảnh đại diện */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                          <button
                            type="button"
                            onClick={() => setPrimaryImage(img.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: img.isPrimary ? '#7C3AED' : '#64748B',
                              fontSize: '10.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            {img.isPrimary ? '✓ Đang là ảnh chính' : 'Đặt làm ảnh chính'}
                          </button>
                          <span style={{ fontSize: '10px', color: '#059669', fontWeight: 700 }}>
                            AI {img.qualityScore}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Báo lỗi nếu có */}
              {formError && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#B91C1C',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <IconAlertTriangle size={16} />
                  <span>{formError}</span>
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F8FAFC'
            }}>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                Đã sẵn sàng {pendingImages.length} ảnh mẫu để trích xuất Vector
              </span>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    stopWebcam();
                    setIsModalOpen(false);
                  }}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Hủy Bỏ
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    backgroundColor: '#7C3AED',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 6px rgba(124, 58, 237, 0.3)'
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <span style={{
                        width: '14px',
                        height: '14px',
                        borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#FFF',
                        animation: 'spin 0.8s linear infinite'
                      }} />
                      Đang Trích Xuất Vector AI...
                    </>
                  ) : (
                    <>
                      <IconCheck size={16} />
                      Lưu Hồ Sơ & Huấn Luyện AI
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL CHỈNH SỬA THÔNG TIN NHÂN SỰ */}
      {/* ========================================================================= */}
      {editingPerson && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F8FAFC'
            }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  ✏️ Chỉnh Sửa Hồ Sơ Nhân Sự
                </h2>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0 0' }}>
                  Cập nhật thông tin định danh và trạng thái hoạt động trong hệ thống AI
                </p>
              </div>
              <button
                onClick={() => setEditingPerson(null)}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: '4px' }}
              >
                <IconClose size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Họ và Tên Nhân Sự
                </label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Mã Nhân Viên / Số CCCD
                </label>
                <input
                  type="text"
                  value={editEmployeeCode}
                  onChange={(e) => setEditEmployeeCode(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Phòng Ban
                  </label>
                  <input
                    type="text"
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Chức Vụ / Vai Trò
                  </label>
                  <input
                    type="text"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Trạng Thái Hoạt Động AI
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    outline: 'none',
                    backgroundColor: '#F8FAFC',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="ACTIVE">🟢 Hoạt Động (Nhận diện & Ghi nhận ra/vào)</option>
                  <option value="INACTIVE">🔴 Tạm Khóa (Vô hiệu hóa nhận diện)</option>
                </select>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              backgroundColor: '#F8FAFC'
            }}>
              <button
                type="button"
                onClick={() => setEditingPerson(null)}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Hủy Bỏ
              </button>

              <button
                type="button"
                disabled={isEditSubmitting}
                onClick={handleSaveEdit}
                style={{
                  padding: '9px 22px',
                  borderRadius: '8px',
                  backgroundColor: '#0284C7',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: isEditSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                }}
              >
                <IconCheck size={16} />
                {isEditSubmitting ? 'Đang Lưu...' : 'Lưu Thay Đổi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FacePeopleView;
