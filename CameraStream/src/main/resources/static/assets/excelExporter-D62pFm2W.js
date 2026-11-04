var e=e=>e==null?``:String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&apos;`),t=({fileName:t,reportTitle:n=`BÁO CÁO DỮ LIỆU GIÁM SÁT`,subtitle:r,columns:i,data:a})=>{if(!a||a.length===0)throw Error(`Không có dữ liệu để xuất Excel.`);let o=new Date().toLocaleString(`vi-VN`),s=t.endsWith(`.xls`)||t.endsWith(`.xlsx`)?t:`${t}_${new Date().toISOString().slice(0,10)}.xls`,c=`<?xml version="1.0" encoding="UTF-8"?>
`;c+=`<?mso-application progid="Excel.Sheet"?>
`,c+=`<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
`,c+=` xmlns:o="urn:schemas-microsoft-com:office:office"
`,c+=` xmlns:x="urn:schemas-microsoft-com:office:excel"
`,c+=` xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
`,c+=` xmlns:html="http://www.w3.org/TR/REC-html40">
`,c+=` <Styles>
`,c+=`  <Style ss:ID="Default" ss:Name="Normal">
`,c+=`   <Alignment ss:Vertical="Center"/>
`,c+=`   <Borders/>
`,c+=`   <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#0F172A"/>
`,c+=`  </Style>
`,c+=`  <Style ss:ID="TitleStyle">
`,c+=`   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
`,c+=`   <Font ss:FontName="Segoe UI" ss:Size="14" ss:Color="#047857" ss:Bold="1"/>
`,c+=`  </Style>
`,c+=`  <Style ss:ID="SubtitleStyle">
`,c+=`   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
`,c+=`   <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Color="#64748B" ss:Italic="1"/>
`,c+=`  </Style>
`,c+=`  <Style ss:ID="HeaderStyle">
`,c+=`   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
`,c+=`   <Borders>
`,c+=`    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>
`,c+=`    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>
`,c+=`    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>
`,c+=`    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#047857"/>
`,c+=`   </Borders>
`,c+=`   <Font ss:FontName="Segoe UI" ss:Size="10.5" ss:Color="#FFFFFF" ss:Bold="1"/>
`,c+=`   <Interior ss:Color="#059669" ss:Pattern="Solid"/>
`,c+=`  </Style>
`,c+=`  <Style ss:ID="RowEven">
`,c+=`   <Alignment ss:Vertical="Center"/>
`,c+=`   <Borders>
`,c+=`    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
`,c+=`    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
`,c+=`    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
`,c+=`   </Borders>
`,c+=`   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
`,c+=`  </Style>
`,c+=`  <Style ss:ID="RowOdd">
`,c+=`   <Alignment ss:Vertical="Center"/>
`,c+=`   <Borders>
`,c+=`    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
`,c+=`    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
`,c+=`    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
`,c+=`   </Borders>
`,c+=`   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
`,c+=`  </Style>
`,c+=` </Styles>
`,c+=` <Worksheet ss:Name="BaoCao">
`,c+=`  <Table>
`,i.forEach(e=>{let t=e.width||120;c+=`   <Column ss:AutoFitWidth="0" ss:Width="${t}"/>\n`}),c+=`   <Row ss:Height="28">
`,c+=`    <Cell ss:MergeAcross="${Math.max(0,i.length-1)}" ss:StyleID="TitleStyle">\n`,c+=`     <Data ss:Type="String">${e(n)}</Data>\n`,c+=`    </Cell>
`,c+=`   </Row>
`;let l=r||`Thời gian xuất: ${o} | Tổng số bản ghi: ${a.length}`;c+=`   <Row ss:Height="18">
`,c+=`    <Cell ss:MergeAcross="${Math.max(0,i.length-1)}" ss:StyleID="SubtitleStyle">\n`,c+=`     <Data ss:Type="String">${e(l)}</Data>\n`,c+=`    </Cell>
`,c+=`   </Row>
`,c+=`   <Row ss:Height="8"/>
`,c+=`   <Row ss:Height="24">
`,i.forEach(t=>{c+=`    <Cell ss:StyleID="HeaderStyle">
`,c+=`     <Data ss:Type="String">${e(t.header)}</Data>\n`,c+=`    </Cell>
`}),c+=`   </Row>
`,a.forEach((t,n)=>{let r=n%2==0?`RowEven`:`RowOdd`;c+=`   <Row ss:Height="20" ss:StyleID="${r}">\n`,i.forEach(r=>{let i=``;r.render?i=r.render(t,n):r.key&&(i=t[r.key]);let a=typeof i==`number`,o=a?`Number`:`String`,s=a?String(i):e(i);c+=`    <Cell>
`,c+=`     <Data ss:Type="${o}">${s}</Data>\n`,c+=`    </Cell>
`}),c+=`   </Row>
`}),c+=`  </Table>
`,c+=` </Worksheet>
`,c+=`</Workbook>`;let u=new Blob([c],{type:`application/vnd.ms-excel;charset=utf-8;`}),d=window.URL.createObjectURL(u),f=document.createElement(`a`);f.href=d,f.setAttribute(`download`,s),f.style.display=`none`,document.body.appendChild(f),f.click(),requestAnimationFrame(()=>{f.parentNode?.removeChild(f),window.URL.revokeObjectURL(d)})},n=(e,t,n=90)=>{if(!e||!t)return`Vui lòng chọn đầy đủ Từ ngày và Đến ngày trước khi xuất Excel.`;let r=new Date(e),i=new Date(t);if(isNaN(r.getTime())||isNaN(i.getTime()))return`Định dạng ngày không hợp lệ.`;if(r>i)return`Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.`;let a=Math.ceil((i.getTime()-r.getTime())/864e5);if(a>n)return`Khoảng thời gian xuất tối đa là ${n} ngày. Bạn đang chọn ${a} ngày.`},r=async({apiBaseUrl:e,endpoint:n,params:r,chunkSize:i=500,maxRows:a=5e4,fileName:o,reportTitle:s,subtitle:c,columns:l,filterItem:u,onProgress:d})=>{let f=[],p=0,m=1,h=0,g={};Object.entries(r).forEach(([e,t])=>{t!=null&&t!==``&&(g[e]=String(t))});let _=localStorage.getItem(`camerastream_token`),v={Accept:`application/json`};for(_&&(v.Authorization=`Bearer ${_}`);p<m&&f.length<a;){let t=new URLSearchParams(g);t.set(`page`,String(p)),t.set(`size`,String(i));let r=await fetch(`${e}${n}?${t.toString()}`,{method:`GET`,headers:v,credentials:`include`});if(!r.ok)throw Error(`Lỗi tải cụm dữ liệu trang ${p+1} (HTTP ${r.status})`);let a=await r.json(),o=a?.data??a,s=Array.isArray(o?.content)?o.content:Array.isArray(o)?o:[];if(h=Number(o?.page?.totalElements??o?.totalElements??s.length),m=Math.max(1,Number(o?.page?.totalPages??o?.totalPages??Math.ceil(h/i))),s.length===0)break;let c=u?s.filter(u):s;f.push(...c);let l=Math.min(h||f.length,(p+1)*i);if(d&&d(l,h||l),p++,s.length<i)break}if(f.length===0)throw Error(`Không có bản ghi nào phù hợp với bộ lọc để xuất Excel.`);t({fileName:o,reportTitle:s,subtitle:c?`${c} | Tổng số xuất: ${f.length} dòng`:void 0,columns:l,data:f})},i=async(e,t,n)=>{let r=localStorage.getItem(`camerastream_token`),i={};r&&(i.Authorization=`Bearer ${r}`);let a=await fetch(e,{method:`GET`,headers:i,credentials:`include`});if(!a.ok)throw Error(`Không thể tải tệp từ máy chủ (HTTP ${a.status})`);let o=a.headers.get(`content-disposition`),s=t;if(o){let e=o.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);if(e&&e[1])try{s=decodeURIComponent(e[1].trim())}catch{s=e[1].trim()}}let c=parseInt(a.headers.get(`content-length`)||`0`,10),l=a.body?.getReader(),u;if(l){let e=[],t=0;for(;;){let{done:r,value:i}=await l.read();if(r)break;i&&(e.push(i),t+=i.length,n&&n(t,c||t))}u=new Blob(e)}else u=await a.blob(),n&&n(u.size,u.size);let d=window.URL.createObjectURL(u),f=document.createElement(`a`);f.href=d,f.setAttribute(`download`,s),f.style.display=`none`,document.body.appendChild(f),f.click(),requestAnimationFrame(()=>{f.parentNode?.removeChild(f),window.URL.revokeObjectURL(d)})};export{n as i,r as n,t as r,i as t};