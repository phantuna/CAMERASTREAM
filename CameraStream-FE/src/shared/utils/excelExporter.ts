/**
 * Excel Exporter Utility – CameraStream-FE
 * Adapter từ pattern hpticket-management-system.
 *
 * Hai chiến lược xuất:
 *  1. downloadExcelFromApi  – GET binary blob trực tiếp từ Backend (endpoint /export)
 *  2. exportDataToExcel     – Client-side sinh file bảng tính Excel (SpreadsheetML) đẹp mắt có style/màu sắc
 *  3. validateDateRange     – Kiểm tra hợp lệ khoảng thời gian trước khi xuất
 */

const escapeXml = (str: any): string => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

export interface ExcelColumn<T = any> {
  header: string;
  key?: keyof T | string;
  width?: number;
  render?: (item: T, index: number) => string | number | null | undefined;
}

export interface ExportReportOptions<T = any> {
  fileName: string;
  reportTitle?: string;
  subtitle?: string;
  columns: ExcelColumn<T>[];
  data: T[];
}

/**
 * Sinh file bảng tính Excel (.xls theo định dạng Microsoft XML Spreadsheet 2003)
 * Định dạng này hỗ trợ màu sắc, viền, font chữ, độ rộng cột và mở mượt mà trên Microsoft Excel/Google Sheets.
 */
export const exportDataToExcel = <T = any>({
  fileName,
  reportTitle = 'BÁO CÁO DỮ LIỆU GIÁM SÁT',
  subtitle,
  columns,
  data
}: ExportReportOptions<T>): void => {
  if (!data || data.length === 0) {
    throw new Error('Không có dữ liệu để xuất Excel.');
  }

  const exportDate = new Date().toLocaleString('vi-VN');
  const safeFileName = fileName.endsWith('.xls') || fileName.endsWith('.xlsx')
    ? fileName
    : `${fileName}_${new Date().toISOString().slice(0, 10)}.xls`;

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<?mso-application progid="Excel.Sheet"?>\n';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
  xml += ' xmlns:o="urn:schemas-microsoft-com:office:office"\n';
  xml += ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n';
  xml += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n';
  xml += ' xmlns:html="http://www.w3.org/TR/REC-html40">\n';

  // STYLES
  xml += ' <Styles>\n';
  xml += '  <Style ss:ID="Default" ss:Name="Normal">\n';
  xml += '   <Alignment ss:Vertical="Center"/>\n';
  xml += '   <Borders/>\n';
  xml += '   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#0F172A"/>\n';
  xml += '  </Style>\n';

  // Tiêu đề lớn
  xml += '  <Style ss:ID="TitleStyle">\n';
  xml += '   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>\n';
  xml += '   <Font ss:FontName="Segoe UI" ss:Size="14" ss:Color="#047857" ss:Bold="1"/>\n';
  xml += '  </Style>\n';

  // Tiêu đề phụ (Thời gian xuất, ghi chú)
  xml += '  <Style ss:ID="SubtitleStyle">\n';
  xml += '   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>\n';
  xml += '   <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Color="#64748B" ss:Italic="1"/>\n';
  xml += '  </Style>\n';

  // Hàng Header cột
  xml += '  <Style ss:ID="HeaderStyle">\n';
  xml += '   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>\n';
  xml += '   <Borders>\n';
  xml += '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>\n';
  xml += '    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>\n';
  xml += '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>\n';
  xml += '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>\n';
  xml += '   </Borders>\n';
  xml += '   <Font ss:FontName="Segoe UI" ss:Size="10.5" ss:Color="#FFFFFF" ss:Bold="1"/>\n';
  xml += '   <Interior ss:Color="#059669" ss:Pattern="Solid"/>\n';
  xml += '  </Style>\n';

  // Dòng chẵn
  xml += '  <Style ss:ID="RowEven">\n';
  xml += '   <Alignment ss:Vertical="Center"/>\n';
  xml += '   <Borders>\n';
  xml += '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>\n';
  xml += '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>\n';
  xml += '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>\n';
  xml += '   </Borders>\n';
  xml += '   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>\n';
  xml += '  </Style>\n';

  // Dòng lẻ (Zebra striping)
  xml += '  <Style ss:ID="RowOdd">\n';
  xml += '   <Alignment ss:Vertical="Center"/>\n';
  xml += '   <Borders>\n';
  xml += '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>\n';
  xml += '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>\n';
  xml += '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>\n';
  xml += '   </Borders>\n';
  xml += '   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>\n';
  xml += '  </Style>\n';
  xml += ' </Styles>\n';

  // WORKSHEET
  xml += ' <Worksheet ss:Name="BaoCao">\n';
  xml += '  <Table>\n';

  // Thiết lập độ rộng cột
  columns.forEach((col) => {
    const width = col.width || 120;
    xml += `   <Column ss:AutoFitWidth="0" ss:Width="${width}"/>\n`;
  });

  // Hàng 1: Tiêu đề báo cáo
  xml += '   <Row ss:Height="28">\n';
  xml += `    <Cell ss:MergeAcross="${Math.max(0, columns.length - 1)}" ss:StyleID="TitleStyle">\n`;
  xml += `     <Data ss:Type="String">${escapeXml(reportTitle)}</Data>\n`;
  xml += '    </Cell>\n';
  xml += '   </Row>\n';

  // Hàng 2: Thời gian xuất / ghi chú
  const subText = subtitle || `Thời gian xuất: ${exportDate} | Tổng số bản ghi: ${data.length}`;
  xml += '   <Row ss:Height="18">\n';
  xml += `    <Cell ss:MergeAcross="${Math.max(0, columns.length - 1)}" ss:StyleID="SubtitleStyle">\n`;
  xml += `     <Data ss:Type="String">${escapeXml(subText)}</Data>\n`;
  xml += '    </Cell>\n';
  xml += '   </Row>\n';

  // Hàng 3: Khoảng cách trống
  xml += '   <Row ss:Height="8"/>\n';

  // Hàng 4: Header các cột
  xml += '   <Row ss:Height="24">\n';
  columns.forEach((col) => {
    xml += '    <Cell ss:StyleID="HeaderStyle">\n';
    xml += `     <Data ss:Type="String">${escapeXml(col.header)}</Data>\n`;
    xml += '    </Cell>\n';
  });
  xml += '   </Row>\n';

  // Dữ liệu từng dòng
  data.forEach((item, index) => {
    const styleId = index % 2 === 0 ? 'RowEven' : 'RowOdd';
    xml += `   <Row ss:Height="20" ss:StyleID="${styleId}">\n`;

    columns.forEach((col) => {
      let cellValue: any = '';
      if (col.render) {
        cellValue = col.render(item, index);
      } else if (col.key) {
        cellValue = (item as any)[col.key];
      }

      const isNumeric = typeof cellValue === 'number';
      const dataType = isNumeric ? 'Number' : 'String';
      const valStr = isNumeric ? String(cellValue) : escapeXml(cellValue);

      xml += '    <Cell>\n';
      xml += `     <Data ss:Type="${dataType}">${valStr}</Data>\n`;
      xml += '    </Cell>\n';
    });

    xml += '   </Row>\n';
  });

  xml += '  </Table>\n';
  xml += ' </Worksheet>\n';
  xml += '</Workbook>';

  // Trigger download blob
  const blob = new Blob([xml], {
    type: 'application/vnd.ms-excel;charset=utf-8;'
  });
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', safeFileName);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  requestAnimationFrame(() => {
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  });
};

/**
 * Tải file Excel trực tiếp từ Backend API.
 *
 * @param apiBaseUrl      - Base URL của backend (VD: "http://localhost:8080")
 * @param endpoint        - Đường dẫn API (VD: '/api/v1/alpr/logs/export')
 * @param params          - Query parameters (VD: { fromDate: '2025-01-01', toDate: '2025-01-31' })
 * @param fallbackFileName - Tên file mặc định nếu không parse được từ Content-Disposition header
 */
export const downloadExcelFromApi = async (
  apiBaseUrl: string,
  endpoint: string,
  params: Record<string, string | number | undefined | null>,
  fallbackFileName: string
): Promise<void> => {
  // Lọc bỏ các param undefined/null, build query string
  const filteredParams: Record<string, string> = {};
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      filteredParams[key] = String(val);
    }
  });

  const query = new URLSearchParams(filteredParams).toString();
  const url = `${apiBaseUrl}${endpoint}${query ? `?${query}` : ''}`;

  const token = localStorage.getItem('camerastream_token');
  const headers: Record<string, string> = {
    Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream, */*',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    let errorMsg = `Lỗi khi tải file từ máy chủ (HTTP ${response.status})`;
    try {
      const errorData = await response.json();
      if (errorData?.message) errorMsg = errorData.message;
    } catch {
      // ignore parse error
    }
    throw new Error(errorMsg);
  }

  const blob = await response.blob();

  // Ưu tiên lấy tên file từ Content-Disposition nếu server trả về
  const contentDisposition = response.headers.get('content-disposition');
  let fileName = fallbackFileName;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
    if (match && match[1]) {
      try {
        fileName = decodeURIComponent(match[1].trim());
      } catch {
        fileName = match[1].trim();
      }
    }
  }

  // Tạo link ảo → trigger download → cleanup
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', fileName);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Cleanup
  requestAnimationFrame(() => {
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  });
};

/**
 * Validate khoảng ngày trước khi gọi export.
 * @returns Error message (string) nếu không hợp lệ, undefined nếu OK.
 */
export const validateDateRange = (
  fromDate: string,
  toDate: string,
  maxRangeDays = 90
): string | undefined => {
  if (!fromDate || !toDate) {
    return 'Vui lòng chọn đầy đủ Từ ngày và Đến ngày trước khi xuất Excel.';
  }

  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return 'Định dạng ngày không hợp lệ.';
  }

  if (from > to) {
    return 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.';
  }

  const diffDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 3600 * 24));
  if (diffDays > maxRangeDays) {
    return `Khoảng thời gian xuất tối đa là ${maxRangeDays} ngày. Bạn đang chọn ${diffDays} ngày.`;
  }

  return undefined;
};

/**
 * Tải dữ liệu lớn theo từng chunk CSV (mặc định 500 dòng/lần) và ghép nối tuần tự phía Client (ADR 0009)
 * Gắn tiền tố UTF-8 BOM (\uFEFF) giúp mở trên Microsoft Excel không bao giờ bị lỗi font tiếng Việt.
 */
export const downloadChunkedCsvFromApi = async (
  apiBaseUrl: string,
  endpoint: string,
  params: Record<string, string | number | undefined | null>,
  fallbackFileName = 'Bao_Cao.csv',
  chunkSize = 500,
  onProgress?: (loadedRows: number, totalRows: number) => void
): Promise<void> => {
  const chunks: string[] = [];
  let page = 0;
  let hasMore = true;
  let totalLoadedRows = 0;
  let totalRows = 0;

  const filteredParams: Record<string, string> = {};
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      filteredParams[key] = String(val);
    }
  });

  const token = localStorage.getItem('camerastream_token');
  const baseHeaders: Record<string, string> = {
    Accept: 'text/csv, text/plain, */*'
  };
  if (token) {
    baseHeaders['Authorization'] = `Bearer ${token}`;
  }

  while (hasMore) {
    const query = new URLSearchParams(filteredParams);
    query.set('page', String(page));
    query.set('chunkSize', String(chunkSize));

    const response = await fetch(`${apiBaseUrl}${endpoint}?${query.toString()}`, {
      method: 'GET',
      headers: baseHeaders,
      credentials: 'include'
    });

    if (!response.ok) {
      let errorMsg = `Lỗi tải chunk dữ liệu (HTTP ${response.status})`;
      try {
        const errorData = await response.json();
        if (errorData?.message) errorMsg = errorData.message;
      } catch {
        // ignore
      }
      throw new Error(errorMsg);
    }

    const csvText = await response.text();
    chunks.push(csvText);

    const hasMoreHeader = response.headers.get('X-Has-More');
    hasMore = hasMoreHeader === 'true';

    const chunkRows = parseInt(response.headers.get('X-Chunk-Rows') || '0', 10);
    totalLoadedRows += chunkRows;
    totalRows = parseInt(response.headers.get('X-Total-Rows') || String(totalLoadedRows), 10);

    if (onProgress) {
      onProgress(totalLoadedRows, totalRows);
    }

    page++;
    if (chunkRows === 0 || !hasMore) break;
  }

  if (totalLoadedRows === 0 && chunks.join('').trim().split('\n').length <= 1) {
    throw new Error('Không có bản ghi nào phù hợp với bộ lọc để xuất.');
  }

  // Ghép nối mảng text thành Blob có tiền tố UTF-8 BOM (\uFEFF)
  const blob = new Blob(['\uFEFF', ...chunks], { type: 'text/csv;charset=utf-8;' });
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  const finalName = fallbackFileName.endsWith('.csv') ? fallbackFileName : `${fallbackFileName}.csv`;
  link.setAttribute('download', finalName);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  requestAnimationFrame(() => {
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  });
};

export interface ChunkedExcelPageOptions<T = any> {
  apiBaseUrl: string;
  endpoint: string;
  params: Record<string, string | number | undefined | null>;
  chunkSize?: number;
  maxRows?: number;
  fileName: string;
  reportTitle?: string;
  subtitle?: string;
  columns: ExcelColumn<T>[];
  filterItem?: (item: T) => boolean;
  onProgress?: (loadedRows: number, totalRows: number) => void;
}

/**
 * Tải dữ liệu phân trang từ Backend theo từng cụm 500 dòng/lần (page = 0, 1, 2..., size = 500),
 * cập nhật tiến độ thực tế qua onProgress, sau đó đóng gói thành file bảng tính Excel (.xls) có định dạng.
 */
export const exportChunkedPagesToExcel = async <T = any>({
  apiBaseUrl,
  endpoint,
  params,
  chunkSize = 500,
  maxRows = 50000,
  fileName,
  reportTitle,
  subtitle,
  columns,
  filterItem,
  onProgress
}: ChunkedExcelPageOptions<T>): Promise<void> => {
  const allItems: T[] = [];
  let page = 0;
  let totalPages = 1;
  let totalElements = 0;

  const filteredParams: Record<string, string> = {};
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      filteredParams[key] = String(val);
    }
  });

  const token = localStorage.getItem('camerastream_token');
  const headers: Record<string, string> = {
    Accept: 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  while (page < totalPages && allItems.length < maxRows) {
    const query = new URLSearchParams(filteredParams);
    query.set('page', String(page));
    query.set('size', String(chunkSize));

    const res = await fetch(`${apiBaseUrl}${endpoint}?${query.toString()}`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    if (!res.ok) {
      throw new Error(`Lỗi tải cụm dữ liệu trang ${page + 1} (HTTP ${res.status})`);
    }

    const json = await res.json();
    const pageData = json?.data ?? json;
    const content: T[] = Array.isArray(pageData?.content)
      ? pageData.content
      : Array.isArray(pageData)
      ? pageData
      : [];

    totalElements = Number(
      pageData?.page?.totalElements ?? pageData?.totalElements ?? content.length
    );
    totalPages = Math.max(
      1,
      Number(
        pageData?.page?.totalPages ??
          pageData?.totalPages ??
          Math.ceil(totalElements / chunkSize)
      )
    );

    if (content.length === 0) break;

    const batch = filterItem ? content.filter(filterItem) : content;
    allItems.push(...batch);

    const loadedCount = Math.min(totalElements || allItems.length, (page + 1) * chunkSize);
    if (onProgress) {
      onProgress(loadedCount, totalElements || loadedCount);
    }

    page++;
    if (content.length < chunkSize) break;
  }

  if (allItems.length === 0) {
    throw new Error('Không có bản ghi nào phù hợp với bộ lọc để xuất Excel.');
  }

  exportDataToExcel({
    fileName,
    reportTitle,
    subtitle: subtitle
      ? `${subtitle} | Tổng số xuất: ${allItems.length} dòng`
      : undefined,
    columns,
    data: allItems
  });
};

/**
 * Tải file nhị phân (Backup SQL.GZ hoặc XLSX lớn) theo luồng ReadableStream chia chunk
 * và báo cáo tiến độ % (receivedBytes / totalBytes) theo thời gian thực.
 */
export const downloadBinaryStreamInChunks = async (
  url: string,
  fallbackFileName: string,
  onProgress?: (loadedBytes: number, totalBytes: number) => void
): Promise<void> => {
  const token = localStorage.getItem('camerastream_token');
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(`Không thể tải tệp từ máy chủ (HTTP ${response.status})`);
  }

  const contentDisposition = response.headers.get('content-disposition');
  let fileName = fallbackFileName;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
    if (match && match[1]) {
      try {
        fileName = decodeURIComponent(match[1].trim());
      } catch {
        fileName = match[1].trim();
      }
    }
  }

  const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
  const reader = response.body?.getReader();

  let blob: Blob;
  if (reader) {
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedBytes += value.length;
        if (onProgress) {
          onProgress(receivedBytes, totalBytes || receivedBytes);
        }
      }
    }
    blob = new Blob(chunks as BlobPart[]);
  } else {
    blob = await response.blob();
    if (onProgress) {
      onProgress(blob.size, blob.size);
    }
  }

  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', fileName);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  requestAnimationFrame(() => {
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  });
};
