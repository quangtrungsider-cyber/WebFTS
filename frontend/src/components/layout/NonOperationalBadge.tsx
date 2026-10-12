import React from 'react';

const NonOperationalBadge = () => {
  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      backgroundColor: 'rgba(255, 193, 7, 0.8)',
      color: '#000',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 'bold',
      zIndex: 9999,
      pointerEvents: 'none'
    }}>
      Decision-support / Non-operational
    </div>
  );
};

export default NonOperationalBadge;
