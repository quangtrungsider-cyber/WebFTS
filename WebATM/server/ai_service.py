import os
import json
import logging

logger = logging.getLogger("webatm")

def analyze_docx(file_path):
    try:
        from docx import Document
    except ImportError:
        logger.error("python-docx is not installed.")
        return mock_analyze("Error: python-docx library is not installed. Please install it.")

    # 1. Extract text
    try:
        doc = Document(file_path)
        full_text = []
        for para in doc.paragraphs:
            if para.text.strip():
                full_text.append(para.text.strip())
        
        # Process tables
        for table in doc.tables:
            for row in table.rows:
                row_data = []
                for cell in row.cells:
                    if cell.text.strip():
                        row_data.append(cell.text.strip().replace('\n', ' '))
                if row_data:
                    full_text.append(" | ".join(row_data))
                
        text_content = "\n".join(full_text)
    except Exception as e:
        logger.error(f"Error reading docx: {e}")
        return mock_analyze(f"Error reading document: {e}")
    
    if not text_content:
        return mock_analyze("Tài liệu trống hoặc không thể trích xuất văn bản.")

    # 2. Try to use Google GenAI
    try:
        import google.generativeai as genai
        from dotenv import load_dotenv
        
        # Explicitly load .env file from the root directory
        env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env')
        load_dotenv(dotenv_path=env_path)
        
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return mock_analyze(text_content)
            
        genai.configure(api_key=api_key)
        
        prompt = f"""
        Bạn là một chuyên gia Quản lý Không lưu (Air Traffic Management).
        Hãy phân tích nội dung tài liệu Hàng không sau đây và trích xuất các thông tin quan trọng.
        TRẢ VỀ DUY NHẤT ĐỊNH DẠNG JSON với cấu trúc sau:
        {{
            "summary": "Tóm tắt ngắn gọn 2-3 câu về nội dung chính của báo cáo.",
            "airports": ["Danh sách mã ICAO các sân bay/phân khu được nhắc đến, ví dụ: VVTS, VVNB, HAN"],
            "conflicts": [
                {{
                    "aircraft_1": "Callsign tàu bay 1 (VD: HVN123)",
                    "aircraft_2": "Callsign tàu bay 2 (VD: VJC456)",
                    "severity": "High/Medium/Low",
                    "description": "Mô tả nguyên nhân và tình huống xung đột (vi phạm phân cách, cắt mặt, sai độ cao...)"
                }}
            ],
            "notes": [
                "Danh sách các lưu ý an toàn, khuyến nghị hoặc điểm cần khắc phục từ tài liệu (mỗi ý 1 dòng ngắn gọn)."
            ]
        }}
        
        Nội dung tài liệu:
        {text_content[:20000]}
        """
        
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(prompt)
        
        # Clean JSON
        res_text = response.text
        if "```json" in res_text:
            res_text = res_text.split("```json")[1].split("```")[0].strip()
        elif "```" in res_text:
            res_text = res_text.split("```")[1].split("```")[0].strip()
            
        return json.loads(res_text)
    except Exception as e:
        logger.error(f"GenAI Error: {e}")
        return mock_analyze(text_content)

def mock_analyze(text_content):
    # Fallback if no API key or error
    return {
        "summary": "Phân tích tự động (Chế độ giả lập). Tài liệu đã được trích xuất thành công nhưng chưa kết nối API Key của AI để tóm tắt thông minh.",
        "airports": ["VATM"],
        "conflicts": [
            {
                "aircraft_1": "N/A",
                "aircraft_2": "N/A",
                "severity": "Low",
                "description": f"Chế độ Test. Tổng số chữ trích xuất: {len(text_content.split())} chữ."
            }
        ],
        "notes": [
            "Trích đoạn nội dung đầu: " + text_content[:150] + "...",
            "Tính năng AI cần cấu hình biến môi trường GEMINI_API_KEY để hoạt động đầy đủ."
        ]
    }
