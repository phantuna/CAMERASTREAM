import React, { useState } from 'react';
import { IconPlus, IconEdit, IconTrash } from '../../components/SurveillanceIcons';

export interface ColumnDef<T> {
  header: string;
  accessor?: string | keyof T | ((row: T, index: number) => React.ReactNode);
  className?: string;
  style?: React.CSSProperties;
}

interface AdminConfigCardProps<T> {
  title: string;
  data: T[];
  columns: ColumnDef<T>[];
  onAddNew?: () => void;
  onEdit?: (selectedItem: T) => void;
  onDelete?: (selectedIds: (string | number)[]) => void;
  onToggleActive?: (id: string | number, currentActive: boolean) => void;
  toolbarRight?: React.ReactNode;
}

export function AdminConfigCard<T extends { id: string | number }>({
  title,
  data,
  columns,
  onAddNew,
  onEdit,
  onDelete,
  onToggleActive,
  toolbarRight
}: AdminConfigCardProps<T>) {
  const [selectedIds, setSelectedIds] = useState<(string | number)[]>([]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(data.map((item) => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string | number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds([]);
    } else {
      setSelectedIds([id]);
    }
  };

  const handleEditClick = () => {
    if (selectedIds.length === 0) {
      alert('Vui lòng chọn 1 dòng cần sửa!');
      return;
    }
    if (selectedIds.length > 1) {
      alert('Vui lòng chỉ chọn 1 dòng để sửa!');
      return;
    }
    const target = data.find((item) => item.id === selectedIds[0]);
    if (target && onEdit) {
      onEdit(target);
    }
  };

  const handleDeleteClick = () => {
    if (selectedIds.length === 0) {
      alert('Vui lòng chọn ít nhất 1 dòng cần xóa!');
      return;
    }
    if (window.confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} mục đã chọn?`)) {
      if (onDelete) {
        onDelete(selectedIds);
        setSelectedIds([]);
      }
    }
  };

  const isAllSelected = data.length > 0 && selectedIds.length === data.length;

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        color: '#0F172A',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
        border: '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}
    >
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <h2
          style={{
            fontSize: '16px',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#1E293B',
            margin: 0
          }}
        >
          {title}
        </h2>
      </div>

      {/* Action Buttons Toolbar & Toolbar Right (matching HPTicket emerald buttons) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onAddNew && (
            <button
              type="button"
              onClick={onAddNew}
              style={{
                backgroundColor: '#059669',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '13px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'background-color 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#047857')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#059669')}
            >
              <IconPlus size={16} /> Thêm mới
            </button>
          )}

          {onEdit && (
            <button
              type="button"
              onClick={handleEditClick}
              style={{
                backgroundColor: '#059669',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '13px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'background-color 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#047857')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#059669')}
            >
              <IconEdit size={16} /> Sửa
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={handleDeleteClick}
              style={{
                backgroundColor: '#059669',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '13px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'background-color 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#047857')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#059669')}
            >
              <IconTrash size={16} /> Xóa
            </button>
          )}
        </div>

        {toolbarRight && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>{toolbarRight}</div>}
      </div>

      {/* Table Area (matching HPTicket exact table styling) */}
      <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
        <table style={{ width: '100%', textAlign: 'left', fontSize: '13px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#F1F5F9', color: '#0F172A', fontWeight: 700, borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ textAlign: 'center', width: '40px', padding: '11px 12px' }}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px',
                    accentColor: '#059669',
                    cursor: 'pointer'
                  }}
                />
              </th>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  style={{
                    fontWeight: 700,
                    padding: '11px 14px',
                    ...(col.style || {})
                  }}
                  className={col.className}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  style={{ padding: '36px', textAlign: 'center', color: '#94A3B8', fontStyle: 'italic' }}
                >
                  Chưa có dữ liệu khai báo.
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const isSelected = selectedIds.includes(row.id);
                const rec = row as Record<string, any>;
                const isActive = Boolean(
                  rec.isActive ??
                  rec.is_active ??
                  rec.active ??
                  (rec.status === 'ACTIVE' || rec.status === true)
                );

                return (
                  <tr
                    key={row.id}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('.toggle-active-checkbox') || target.tagName === 'BUTTON') {
                        return;
                      }
                      handleSelectRow(row.id);
                    }}
                    style={{
                      cursor: 'pointer',
                      borderBottom: '1px solid #F1F5F9',
                      backgroundColor: isSelected ? '#EFF6FF' : index % 2 === 1 ? '#F8FAFC' : '#FFFFFF',
                      transition: 'background-color 0.15s ease'
                    }}
                  >
                    {/* Checkbox row */}
                    <td style={{ textAlign: 'center', padding: '10px 12px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '4px',
                          accentColor: '#059669',
                          cursor: 'pointer'
                        }}
                      />
                    </td>

                    {/* Column values */}
                    {columns.map((col, colIdx) => {
                      if (col.header === 'Sử dụng') {
                        return (
                          <td key={colIdx} style={{ textAlign: 'center', padding: '10px 12px' }}>
                            <input
                              type="checkbox"
                              checked={isActive}
                              onChange={() => onToggleActive && onToggleActive(row.id, isActive)}
                              disabled={!onToggleActive}
                              className="toggle-active-checkbox"
                              style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '4px',
                                accentColor: '#0284C7',
                                cursor: onToggleActive ? 'pointer' : 'not-allowed'
                              }}
                            />
                          </td>
                        );
                      }

                      let cellContent: React.ReactNode = null;
                      if (typeof col.accessor === 'function') {
                        cellContent = col.accessor(row, index);
                      } else if (typeof col.accessor === 'string') {
                        cellContent = rec[col.accessor] ?? '—';
                      }

                      return (
                        <td
                          key={colIdx}
                          style={{
                            padding: '10px 14px',
                            ...(col.style || {})
                          }}
                          className={col.className}
                        >
                          {cellContent}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export default AdminConfigCard;
