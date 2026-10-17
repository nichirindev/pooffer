export const VILLAGE_EQ = `pixel (m,n), m=1..2000, n=1..1200;  x=(m-1000)/600,  y=(501-n)/600
colour = rgb( F(H_0(x,y)), F(H_1(x,y)), F(H_2(x,y)) )
F(h) = floor( 255 * e^(-e^(-1000*h)) * |h|^(e^(-e^(1000*(h-1)))) )

E(x,y) = sum_{s=1..40} (24/25)^s * cos( scale*(-cos(s^2)*x + sin(s^2)*y + 2cos(17s)) + 2cos(5s) )
                                     * cos( scale*( cos(s^2)*y + sin(s^2)*x + 2cos(15s)) + 2cos(7s) ),
         scale = (6/5)^s * 10                                    [fractal terrain]

B(x,y) = exp( -sum_{s=1..40} exp( (28-20y) * (49/50)^s *
              ( cos(ang+2cos(17s^2)) * cos(ang2+2cos(18s^2)) + (E-99)/100 ) ) ),
         denom=(3-2y); base_x=(2x+2cos(5s^2))/denom; base_y=2/denom;
         q=(107/100)^s*30;
         ang =q*(cos(15s^2)*base_x + sin(15s^2)*base_y);
         ang2=q*(sin(15s^2)*base_x - cos(15s^2)*base_y)           [ground mask]

M(x,y) = exp( -exp( -50*( |y + x/15 - x^2/7 + cos(3x+cos(2x))/12 + 57/50| - 0.1 - E/200 ) ) )
                                                                     [snow mask]

Houses s=1..67:
  C=(400+s)/(480-320y);  V=arctan(tan(40C));  L=x*C+0.25*cos(7*(40C-V)^2);  U=arctan(tan(10L))
  dU=10L-U;  dV=40C-V;  N=dU^2+dV^2
  P=cos(N)*V - sin(N)*U;  Q=cos(N)*U + sin(N)*V;  R=1-0.3*cos(2*dU^2+3*dV^2)
  Ws = exp(-exp(50500-1000s))              [=0 for s<=50, =1 for s>=51]
  T  = exp(-exp( -100*(s-0.5) - exp(1000*(cos(6*dU^2+8*dV^2)-0.8)) - exp(roofDist) )),
       roofDist = 500*(6+cos(2*dU^2+dV^2))*dU^2 + 1000*(40*(C-27/20)-V)^2 - 1e6
  J  = T*(1-Ws)*exp( -exp(100*|Q|-2*s*R-15) - exp(100*(|P|-R)) )              [windows]
  K  = T*exp( -exp( 200*|Q|-(4*s*(1-Ws)+(190+4*E)*Ws)*R ) - exp(100*|P|-R*(100+2*E)) )  [walls]
  detail=exp(-exp(1000*(cos(8*dU^2+3*dV^2)-0.4)));  snowFade=exp(-exp(20*|Q|-6*R-exp(2*|s-40|-10)))
  contrib = (J+K*(1-J)) * detail * (1+6*snowFade) * ((100-s)/100)
  A_v += Z * contrib * (cos(12*s^2)-v+5)/20   (v=0,1,2);   Z *= (1-J)*(1-K)   (Z_0=1)

H_v = 0.9*(1-B) + ((13v^2-16v+103)/50000) * B * (10*A_v + 9*Z_67) * (5+2v+(45-2v)*M)
Art: Hamid Naderi Yeganeh.`;

export const TRACE_HINT_UPLOADED =
  'Press Render — contours get fitted to segments or Fourier trig series and drawn razor-sharp at full render width. The Desmos-pasteable equations appear here.';

export const TRACE_HINT_EMPTY =
  'Upload an image first (section 1) — Render will trace it to vector curves and draw it sharp at hi-res.';
